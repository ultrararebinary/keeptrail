import Fastify, { type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { randomBytes, randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { chmod, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_VERSION, openDatabase, ensureDataDirectory, listLibrary, getItemDetail, importUrl, updateItem, graph, newId, itemDiagnostics, retryItem, capabilities,
  commitStagedAssetFile, stageAssetStream, resolveOwnedAssetPath, MAX_ORIGINAL_BYTES, requestJobState, OmniRouteClient, readInferenceKey, GatewayError, ensureManagedGateway, managedGatewayStatus, GatewaySupervisorError, reserveHealthChecks, markInferenceStarted, finishInference
} from '@keeptrail/core';
import { Health, ImportUrlsRequest, ItemDetail, LibraryResponse, ProviderId, Settings, UpdateItemRequest } from '@keeptrail/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDirectory = ensureDataDirectory();
const db = openDatabase(dataDirectory);
const app = Fastify({ logger: { level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' }, bodyLimit: 2 * 1024 * 1024 });
app.addHook('onClose', async () => { db.close(); });

const SESSION_COOKIE = 'keeptrail_session';
const CSRF_COOKIE = 'keeptrail_csrf';
const cookieValue = (request: FastifyRequest, name: string): string | null => {
  const cookies = request.headers.cookie?.split(';').map((cookie) => cookie.trim()) ?? [];
  const value = cookies.find((cookie) => cookie.startsWith(`${name}=`))?.slice(name.length + 1);
  return value ? decodeURIComponent(value) : null;
};

function issueSessionCookies(request: FastifyRequest, reply: import('fastify').FastifyReply): void {
  const session = cookieValue(request, SESSION_COOKIE) ?? randomBytes(24).toString('base64url');
  const csrf = cookieValue(request, CSRF_COOKIE) ?? randomBytes(24).toString('base64url');
  const current = request.headers.cookie ?? '';
  const cookies: string[] = [];
  if (!current.includes(`${SESSION_COOKIE}=`)) cookies.push(`${SESSION_COOKIE}=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Strict`);
  if (!current.includes(`${CSRF_COOKIE}=`)) cookies.push(`${CSRF_COOKIE}=${encodeURIComponent(csrf)}; Path=/; SameSite=Strict`);
  if (cookies.length) reply.header('set-cookie', cookies);
}

function isLocalOrigin(request: FastifyRequest): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return ['127.0.0.1', 'localhost'].includes(url.hostname) && ['4317', '5173', '4173', ''].includes(url.port);
  } catch { return false; }
}

function setting(key: string, fallback: string): string {
  return (db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined)?.value ?? fallback;
}

function setSetting(key: string, value: string): void {
  db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run(key, value, new Date().toISOString());
}

async function toolVersions(): Promise<Record<string, unknown>> {
  try {
    const lock = JSON.parse(await readFile(resolve(__dirname, '../../../.tools/tools.lock.json'), 'utf8')) as {
      ytDlp?: { version?: string }; ffmpeg?: { version?: string }; whisper?: { version?: string };
      omniRoute?: { version?: string }; models?: Array<{ name?: string; sha256?: string }>;
    };
    return {
      node: process.version,
      ytDlp: lock.ytDlp?.version ?? 'missing',
      ffmpeg: typeof lock.ffmpeg?.version === 'string' ? lock.ffmpeg.version.split('\n')[0] : 'missing',
      whisper: lock.whisper?.version ?? 'missing',
      omniRoute: lock.omniRoute?.version ?? 'missing',
      models: Array.isArray(lock.models) ? lock.models.map((model) => ({ name: model.name, sha256: model.sha256 })) : []
    };
  } catch { return { node: process.version, ytDlp: 'missing', ffmpeg: 'missing', whisper: 'missing', omniRoute: 'missing', models: [] }; }
}

const providers = {
  groq: {
    id: 'groq', name: 'Groq', model: 'groq/qwen/qwen3.6-27b',
    keyUrl: 'https://console.groq.com/keys', docsUrl: 'https://console.groq.com/docs/vision',
    freeSummary: 'Free developer tier: Qwen 3.6 accepts text and up to five images per request. Groq documents 30 RPM, 1,000 requests/day, 8,000 TPM, and 200,000 TPD for this model.', supportsVision: true
  },
  openrouter: {
    id: 'openrouter', name: 'OpenRouter Free', model: 'openrouter/openrouter/free',
    keyUrl: 'https://openrouter.ai/settings/keys', docsUrl: 'https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground',
    freeSummary: 'The Free Models Router accepts text and images and chooses an available free vision model. OpenRouter documents 50 free-model requests/day without purchased credits; availability can change.', supportsVision: true
  },
  mistral: {
    id: 'mistral', name: 'Mistral Free', model: 'mistral/mistral-small-latest',
    keyUrl: 'https://console.mistral.ai/api-keys', docsUrl: 'https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key',
    freeSummary: 'Mistral Studio Free mode needs no credit card. Mistral Small accepts text and images; usage and rate limits apply.', supportsVision: true
  },
  gemini: {
    id: 'gemini', name: 'Google Gemini', model: 'gemini/gemini-2.5-flash-lite',
    keyUrl: 'https://aistudio.google.com/api-keys', docsUrl: 'https://ai.google.dev/gemini-api/docs/pricing#gemini-2.5-flash-lite',
    freeSummary: 'Google AI Studio Developer API with billing disabled. Availability depends on account, region, and Google free-tier limits.', supportsVision: true
  }
} as const;

function currentProvider(): ProviderId {
  const parsed = ProviderId.safeParse(setting('ai_provider', 'mistral'));
  return parsed.success ? parsed.data : 'mistral';
}

function providerKeyPath(provider: ProviderId): string {
  return join(dataDirectory, 'config', `${provider}.key`);
}

function providerKeyConfigured(provider: ProviderId): boolean {
  return setting(`${provider}_key_configured`, '0') === '1';
}

async function settingsPayload() {
  const provider = currentProvider();
  const descriptor = providers[provider];
  const gateway = providerKeyConfigured(provider) ? await managedGatewayStatus(dataDirectory) : { running: false, status: 'not_configured' as const, pid: null };
  const tested = setting('gateway_tested_provider', '') === provider;
  const cloudCallsToday = (db.prepare("SELECT COUNT(*) AS count FROM inference_calls WHERE substr(created_at,1,10)=substr(?,1,10)").get(new Date().toISOString()) as { count: number }).count;
  return Settings.parse({
    provider,
    providerName: descriptor.name,
    hasProviderKey: providerKeyConfigured(provider),
    keyUrl: descriptor.keyUrl,
    docsUrl: descriptor.docsUrl,
    freeSummary: descriptor.freeSummary,
    supportsVision: descriptor.supportsVision,
    providers: Object.values(providers),
    hasGeminiKey: providerKeyConfigured('gemini'),
    browserSessionEnabled: setting('browser_session_enabled', '0') === '1',
    browserName: (setting('browser_name', '') || null) as 'brave' | 'chrome' | 'firefox' | null,
    dailyCloudCap: Number(setting('daily_cloud_cap', '30')),
    cloudCallsToday,
    processingPaused: setting('processing_paused', '0') === '1', dataDirectory,
    gatewayStatus: !providerKeyConfigured(provider) ? 'not_configured' : gateway.status === 'healthy' && tested ? 'healthy' : gateway.status === 'not_configured' ? 'not_configured' : 'unavailable',
    gatewayRunning: gateway.running,
    authenticationAccepted: tested && setting('gateway_text_health', 'unknown') === 'passed',
    textHealth: tested ? setting('gateway_text_health', 'unknown') as 'unknown' | 'passed' | 'failed' : 'unknown',
    visionHealth: tested ? setting('gateway_vision_health', 'unknown') as 'unknown' | 'passed' | 'failed' : 'unknown', model: descriptor.model
  });
}

app.register(multipart, { limits: { files: 1, fileSize: 500 * 1024 * 1024 } });
app.addHook('preHandler', async (request, reply) => {
  const host = request.headers.host ?? request.hostname;
  let hostname = request.hostname;
  let port = '';
  try { const parsed = new URL(`http://${host}`); hostname = parsed.hostname; port = parsed.port; } catch { return reply.code(403).send({ error: 'Local host required.' }); }
  if (!['127.0.0.1', 'localhost'].includes(hostname) || (port && !['4317', '5173', '4173'].includes(port))) return reply.code(403).send({ error: 'Local host required.' });
  issueSessionCookies(request, reply);
  if (request.url.includes('/diagnostics') && !isLocalOrigin(request)) return reply.code(403).send({ error: 'Local origin required.' });
  if (['POST', 'PATCH', 'DELETE'].includes(request.method)) {
    if (!isLocalOrigin(request)) return reply.code(403).send({ error: 'Cross-origin mutations are not allowed.' });
    const csrf = cookieValue(request, CSRF_COOKIE);
    if (!csrf || request.headers['x-csrf-token'] !== csrf) return reply.code(403).send({ error: 'A local CSRF token is required.' });
  }
});
app.addHook('onSend', async (request, reply) => {
  reply.header('x-request-id', request.id);
  if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
});

app.get('/api/diagnostics', async () => ({
  schemaVersion: 1, generatedAt: new Date().toISOString(), version: APP_VERSION, node: process.version,
  capabilities, provider: { id: currentProvider(), keyConfigured: providerKeyConfigured(currentProvider()), analysisStatus: providerKeyConfigured(currentProvider()) ? 'available' : 'waiting' },
  tooling: await toolVersions(),
  worker: { heartbeat: setting('worker_heartbeat', '') || null, leaseAgeMs: (() => { const heartbeat = Date.parse(setting('worker_heartbeat', '')); return Number.isFinite(heartbeat) ? Math.max(0, Date.now() - heartbeat) : null; })() },
  jobs: db.prepare('SELECT stage,status,COUNT(*) AS count,MAX(updated_at) AS updatedAt,MAX(next_attempt_at) AS nextAttemptAt FROM jobs GROUP BY stage,status').all(),
  quota: { cap: Math.max(1, Math.min(30, Number(setting('daily_cloud_cap', '30')) || 30)), used: (db.prepare("SELECT COUNT(*) AS count FROM inference_calls WHERE substr(created_at,1,10)=substr(?,1,10)").get(new Date().toISOString()) as { count: number }).count },
  privacy: 'No credentials, source content, URLs or local paths are included.'
}));

app.get('/api/items/:id/diagnostics', async (request, reply) => {
  const report = itemDiagnostics(db, (request.params as { id: string }).id);
  return report ?? reply.code(404).send({ error: 'Item not found.' });
});

app.post('/api/items/:id/retry', async (request, reply) => {
  const result = retryItem(db, (request.params as { id: string }).id);
  return reply.code(result.status === 'missing' ? 404 : result.status === 'busy' ? 409 : 202).send(result);
});

app.post('/api/items/:id/:action(pause|resume|cancel)', async (request, reply) => {
  const action = (request.params as { action: 'pause' | 'resume' | 'cancel' }).action;
  const result = requestJobState(db, (request.params as { id: string }).id, action);
  if (!result.ok) return reply.code(result.code === 'MISSING' ? 404 : 409).send({ error: result.code === 'MISSING' ? 'Item not found.' : `The item cannot be ${action}d in its current state.` });
  return reply.code(202).send(result);
});

function pageLimit(raw: unknown, maximum: number): number {
  const value = Number(raw);
  return Number.isInteger(value) ? Math.min(Math.max(value, 1), maximum) : Math.min(20, maximum);
}

function decodeOffsetCursor(raw: unknown): number {
  if (typeof raw !== 'string' || !raw) return 0;
  try { const value = Number(Buffer.from(raw, 'base64url').toString('utf8')); return Number.isInteger(value) && value >= 0 ? value : 0; } catch { return 0; }
}

function encodeOffsetCursor(offset: number, limit: number, total: number): string | null {
  const next = offset + limit;
  return next < total ? Buffer.from(String(next)).toString('base64url') : null;
}

app.get('/api/items/:id/jobs', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const total = (db.prepare('SELECT COUNT(*) AS count FROM jobs WHERE item_id=?').get(id) as { count: number }).count;
  if (!db.prepare('SELECT 1 FROM items WHERE id=?').get(id)) return reply.code(404).send({ error: 'Item not found.' });
  const limit = pageLimit((request.query as { limit?: string }).limit, 100);
  const offset = decodeOffsetCursor((request.query as { cursor?: string }).cursor);
  const items = db.prepare('SELECT id,stage,status,attempt_count,created_at,updated_at,next_attempt_at,error_category,lease_expires_at FROM jobs WHERE item_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?').all(id, limit, offset);
  return { items, total, nextCursor: encodeOffsetCursor(offset, limit, total) };
});

app.get('/api/items/:id/transcript', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  if (!db.prepare('SELECT 1 FROM items WHERE id=?').get(id)) return reply.code(404).send({ error: 'Item not found.' });
  const total = (db.prepare('SELECT COUNT(*) AS count FROM transcript_segments WHERE item_id=?').get(id) as { count: number }).count;
  const limit = pageLimit((request.query as { limit?: string }).limit, 100);
  const offset = decodeOffsetCursor((request.query as { cursor?: string }).cursor);
  const items = db.prepare('SELECT id,text,start_ms AS startMs,end_ms AS endMs,language,evidence_id AS evidenceId FROM transcript_segments WHERE item_id=? ORDER BY start_ms,id LIMIT ? OFFSET ?').all(id, limit, offset);
  return { items, total, nextCursor: encodeOffsetCursor(offset, limit, total) };
});

app.get('/api/items/:id/evidence', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  if (!db.prepare('SELECT 1 FROM items WHERE id=?').get(id)) return reply.code(404).send({ error: 'Item not found.' });
  const total = (db.prepare('SELECT COUNT(*) AS count FROM evidence WHERE item_id=?').get(id) as { count: number }).count;
  const limit = pageLimit((request.query as { limit?: string }).limit, 100);
  const offset = decodeOffsetCursor((request.query as { cursor?: string }).cursor);
  const items = db.prepare('SELECT id,kind,label,excerpt,start_ms AS startMs,end_ms AS endMs FROM evidence WHERE item_id=? ORDER BY rowid LIMIT ? OFFSET ?').all(id, limit, offset);
  return { items, total, nextCursor: encodeOffsetCursor(offset, limit, total) };
});

app.get('/api/items/:id/captures', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  if (!db.prepare('SELECT 1 FROM items WHERE id=?').get(id)) return reply.code(404).send({ error: 'Item not found.' });
  const total = (db.prepare("SELECT COUNT(*) AS count FROM assets WHERE item_id=? AND role='capture'").get(id) as { count: number }).count;
  const limit = pageLimit((request.query as { limit?: string }).limit, 100);
  const offset = decodeOffsetCursor((request.query as { cursor?: string }).cursor);
  const items = db.prepare("SELECT id,mime,bytes,timestamp_ms AS timestampMs FROM assets WHERE item_id=? AND role='capture' ORDER BY timestamp_ms,id LIMIT ? OFFSET ?").all(id, limit, offset);
  return { items: (items as Array<{ id: string; mime: string; bytes: number; timestampMs: number | null }>).map((item) => ({ ...item, url: `/api/assets/${item.id}` })), total, nextCursor: encodeOffsetCursor(offset, limit, total) };
});

app.get('/api/health', async () => {
  const heartbeat = Date.parse(setting('worker_heartbeat', ''));
  const providerConfigured = providerKeyConfigured(currentProvider());
  const gateway = providerConfigured ? await managedGatewayStatus(dataDirectory) : { status: 'not_configured' as const };
  return Health.parse({
    schemaVersion: 1,
    ok: true,
    version: APP_VERSION,
    node: process.version,
    dataDirectory,
    database: 'ok',
    worker: Number.isFinite(heartbeat) && Date.now() - heartbeat < 5_000 ? 'online' : 'offline',
    gateway: !providerConfigured ? 'not_configured' : gateway.status === 'healthy' ? 'configured' : gateway.status,
    providerKeyConfigured: providerConfigured,
    capabilities
  });
});

app.get('/api/library', async (request, reply) => {
  const query = request.query as { q?: string; topic?: string; platform?: string; tag?: string; limit?: string; cursor?: string };
  const result = LibraryResponse.parse(listLibrary(db, { query: query.q, topic: query.topic, platform: query.platform, tag: query.tag, limit: Number(query.limit) || 20, offset: decodeOffsetCursor(query.cursor) }));
  return reply.send(result);
});

app.get('/api/items/:id', async (request, reply) => {
  const item = getItemDetail(db, (request.params as { id: string }).id);
  if (!item) return reply.code(404).send({ error: 'Item not found.' });
  return reply.send(ItemDetail.parse(item));
});

app.get('/api/graph', async (request) => {
  const query = request.query as { topic?: string; itemId?: string; minX?: string; maxX?: string; minY?: string; maxY?: string; cursor?: string };
  const numberOrUndefined = (value: string | undefined) => value === undefined ? undefined : Number(value);
  return graph(db, query.topic || null, query.itemId || null, { minX: numberOrUndefined(query.minX), maxX: numberOrUndefined(query.maxX), minY: numberOrUndefined(query.minY), maxY: numberOrUndefined(query.maxY), cursor: query.cursor });
});

app.post('/api/import/url', async (request, reply) => {
  const parsed = ImportUrlsRequest.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'Paste one or more HTTP(S) URLs, one per line.' });
  const lines = [...new Set(parsed.data.urls.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))].slice(0, 20);
  const created: Array<{ id: string; url: string; status: string }> = [];
  const existing: Array<{ id: string; url: string; status: string }> = [];
  const rejected: Array<{ url: string; reason: string }> = [];
  lines.forEach((line) => {
    try { const result = importUrl(db, line); (result.kind === 'created' ? created : existing).push(result); }
    catch (error) { rejected.push({ url: line.slice(0, 2048), reason: error instanceof Error ? error.message : 'This URL could not be imported.' }); }
  });
  return reply.code(created.length || existing.length ? 202 : 400).send({ created, existing, rejected });
});

app.post('/api/import/file', async (request, reply) => {
  const part = await request.file();
  if (!part) return reply.code(400).send({ error: 'Choose a local image or video file.' });
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime', 'video/webm']);
  if (!allowed.has(part.mimetype)) return reply.code(415).send({ error: 'Use a JPEG, PNG, WebP, MP4, MOV, or WebM file.' });
  let staged: { path: string; bytes: number; sha256: string };
  try {
    staged = await stageAssetStream(part.file, dataDirectory, randomUUID(), MAX_ORIGINAL_BYTES);
  } catch (error) {
    return reply.code(error instanceof Error && /exceeds/.test(error.message) ? 413 : 400).send({ error: error instanceof Error ? error.message.slice(0, 240) : 'The file could not be staged safely.' });
  }
  const existing = db.prepare('SELECT id,status FROM items WHERE content_hash=?').get(staged.sha256) as { id: string; status: string } | undefined;
  if (existing) {
    await rm(staged.path, { force: true });
    return reply.code(202).send({ existing: [{ id: existing.id, status: existing.status }], created: [], rejected: [] });
  }
  const type = part.mimetype.startsWith('image/') ? 'image' : 'video';
  const now = new Date().toISOString();
  const itemId = randomUUID();
  try {
    db.transaction(() => {
      db.prepare(`INSERT INTO items (id,type,platform,source_url,canonical_url,title,description,status,created_at,content_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(itemId, type, 'local', null, null, part.filename.slice(0, 160), '', 'queued', now, staged.sha256);
      db.prepare(`INSERT INTO search_chunks (id,item_id,source_kind,source_id,body,evidence_ids_json) VALUES (?,?,?,?,?,?)`).run(newId(), itemId, 'description', `description:${itemId}`, part.filename, JSON.stringify([`description:${itemId}`]));
    })();
    await commitStagedAssetFile(db, { itemId, stagedPath: staged.path, bytes: staged.bytes, sha256: staged.sha256, filename: part.filename, mime: part.mimetype, dataDirectory });
    db.prepare(`INSERT INTO jobs (id,item_id,stage,status,created_at,updated_at) VALUES (?,?,?,'queued',?,?)`).run(randomUUID(), itemId, 'acquire', now, now);
  } catch (error) {
    db.prepare('DELETE FROM items WHERE id=?').run(itemId);
    await rm(staged.path, { force: true });
    return reply.code(500).send({ error: error instanceof Error ? error.message.slice(0, 240) : 'The file could not be registered safely.' });
  }
  return reply.code(202).send({ created: [{ id: itemId, status: 'queued' }], existing: [], rejected: [] });
});

app.patch('/api/items/:id', async (request, reply) => {
  const itemId = (request.params as { id: string }).id;
  if (!db.prepare('SELECT 1 FROM items WHERE id=?').get(itemId)) return reply.code(404).send({ error: 'Item not found.' });
  const parsed = UpdateItemRequest.safeParse(request.body);
  if (!parsed.success) return reply.code(400).send({ error: 'The note or tags could not be saved.' });
  updateItem(db, itemId, parsed.data);
  return reply.send(getItemDetail(db, itemId));
});

app.get('/api/providers', async () => Object.values(providers));

app.get('/api/settings', async () => settingsPayload());

app.patch('/api/settings', async (request, reply) => {
  const body = request.body as { provider?: string; apiKey?: string | null; geminiKey?: string | null; browserSessionEnabled?: boolean; browserName?: 'brave' | 'chrome' | 'firefox' | null; dailyCloudCap?: number; processingPaused?: boolean; billingAcknowledged?: boolean };
  const selected = body.provider === undefined ? currentProvider() : ProviderId.safeParse(body.provider);
  if (typeof selected !== 'string' && !selected.success) return reply.code(400).send({ error: 'Choose Groq, OpenRouter Free, Mistral Free, or Google Gemini.' });
  const provider = typeof selected === 'string' ? selected : selected.data;
  setSetting('ai_provider', provider);
  const submittedKey = body.apiKey !== undefined ? body.apiKey : provider === 'gemini' ? body.geminiKey : undefined;
  if (submittedKey !== undefined) {
    if (submittedKey && submittedKey.trim().length < 20) return reply.code(400).send({ error: 'That API key looks too short.' });
    const keyPath = providerKeyPath(provider);
    if (submittedKey) {
      await writeFile(keyPath, `${submittedKey.trim()}\n`, { encoding: 'utf8', mode: 0o600 });
      await chmod(keyPath, 0o600);
    } else {
      await unlink(keyPath).catch(() => undefined);
    }
    setSetting(`${provider}_key_configured`, submittedKey ? '1' : '0');
    if (provider === 'gemini') setSetting('billing_acknowledged', body.billingAcknowledged ? '1' : setting('billing_acknowledged', '0'));
  }
  if (body.browserSessionEnabled !== undefined) setSetting('browser_session_enabled', body.browserSessionEnabled ? '1' : '0');
  if (body.browserName !== undefined) setSetting('browser_name', body.browserName ?? '');
  if (body.dailyCloudCap !== undefined) { if (!Number.isInteger(body.dailyCloudCap) || body.dailyCloudCap < 1 || body.dailyCloudCap > 30) return reply.code(400).send({ error: 'The daily cap must be between 1 and 30.' }); setSetting('daily_cloud_cap', String(body.dailyCloudCap)); }
  if (body.processingPaused !== undefined) setSetting('processing_paused', body.processingPaused ? '1' : '0');
  return reply.send(await settingsPayload());
});

app.post('/api/settings/test', async (_request, reply) => {
  const provider = currentProvider();
  if (!providerKeyConfigured(provider)) return reply.code(409).send({ error: 'Save a provider key before testing the managed gateway.', code: 'KEY_MISSING' });
  let healthReservationIds: string[] = [];
  try {
    const providerKey = await readInferenceKey(providerKeyPath(provider));
    const gateway = await ensureManagedGateway(dataDirectory, { provider, providerKey });
    const reservations = reserveHealthChecks(db, { provider, requestedModel: gateway.model });
    if (!reservations.allowed) return reply.code(429).send({ error: 'The daily cloud-call cap leaves fewer than two slots for the text and vision health checks.', code: 'QUOTA_DAILY_CAP', retryAt: reservations.retryAt });
    healthReservationIds = [...reservations.ids];
    reservations.ids.forEach((id) => markInferenceStarted(db, id));
    const fixture = resolve(__dirname, '../../../docs/design/index-reference.png');
    const result = await new OmniRouteClient({ apiKey: gateway.apiKey, provider }).healthCheck(fixture);
    finishInference(db, reservations.ids[0], { status: 'success', returnedModel: result.returnedModels[0] });
    finishInference(db, reservations.ids[1], { status: 'success', returnedModel: result.returnedModels[1] });
    setSetting('gateway_tested_provider', provider);
    setSetting('gateway_text_health', result.textPassed ? 'passed' : 'failed');
    setSetting('gateway_vision_health', result.visionPassed ? 'passed' : 'failed');
    return reply.send({ ok: true, provider, textHealth: result.textPassed ? 'passed' : 'failed', visionHealth: result.visionPassed ? 'passed' : 'failed' });
  } catch (error) {
    healthReservationIds.forEach((id) => finishInference(db, id, { status: 'unknown' }));
    setSetting('gateway_text_health', 'failed');
    setSetting('gateway_vision_health', 'failed');
    const status = error instanceof GatewayError && error.status >= 400 && error.status < 500 ? 502 : 503;
    const code = error instanceof GatewaySupervisorError ? error.code : error instanceof GatewayError && error.status === 0 ? 'GATEWAY_UNAVAILABLE' : 'GATEWAY_TEST_FAILED';
    return reply.code(status).send({ error: error instanceof Error ? error.message : 'The managed gateway health check failed.', code });
  }
});

app.post('/api/items/:id/original/delete', async (request, reply) => {
  const itemId = (request.params as { id: string }).id;
  const item = db.prepare(`SELECT id,status,original_deleted_at FROM items WHERE id=?`).get(itemId) as { id: string; status: string; original_deleted_at: string | null } | undefined;
  if (!item) return reply.code(404).send({ error: 'Item not found.' });
  if (item.status !== 'ready') return reply.code(409).send({ error: 'The original can only be removed after successful processing.' });
  const assets = db.prepare(`SELECT id,relative_path FROM assets WHERE item_id=? AND role='original'`).all(itemId) as Array<{ id: string; relative_path: string }>;
  const removedBytes = (db.prepare("SELECT COALESCE(SUM(bytes),0) AS bytes FROM assets WHERE item_id=? AND role='original'").get(itemId) as { bytes: number }).bytes;
  for (const asset of assets) {
    const target = resolveOwnedAssetPath(dataDirectory, asset.relative_path);
    if (target && existsSync(target)) await unlink(target);
    db.prepare('DELETE FROM assets WHERE id=?').run(asset.id);
  }
  db.prepare('UPDATE items SET original_deleted_at=? WHERE id=?').run(new Date().toISOString(), itemId);
  return reply.send({ ok: true, removedBytes });
});

app.get('/api/assets/:id', async (request, reply) => {
  const asset = db.prepare('SELECT relative_path,mime,bytes FROM assets WHERE id=?').get((request.params as { id: string }).id) as { relative_path: string; mime: string; bytes: number } | undefined;
  if (!asset) return reply.code(404).send({ error: 'Asset not found.' });
  const target = resolveOwnedAssetPath(dataDirectory, asset.relative_path);
  if (!target || !existsSync(target)) return reply.code(404).send({ error: 'Asset file not found.' });
  const range = request.headers.range;
  const size = asset.bytes;
  reply.type(asset.mime).header('accept-ranges', 'bytes');
  if (!range) return reply.header('content-length', String(size)).send(createReadStream(target));
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match || (match[1] === '' && match[2] === '') || range.includes(',')) return reply.code(416).header('content-range', `bytes */${size}`).send();
  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (!Number.isInteger(suffix) || suffix <= 0) return reply.code(416).header('content-range', `bytes */${size}`).send();
    start = Math.max(0, size - suffix); end = size - 1;
  } else {
    start = Number(match[1]); end = match[2] === '' ? size - 1 : Number(match[2]);
  }
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return reply.code(416).header('content-range', `bytes */${size}`).send();
  end = Math.min(end, size - 1);
  return reply.code(206).header('content-range', `bytes ${start}-${end}/${size}`).header('content-length', String(end - start + 1)).send(createReadStream(target, { start, end }));
});

app.get('/api/items/:id/export.json', async (request, reply) => {
  const item = getItemDetail(db, (request.params as { id: string }).id);
  if (!item) return reply.code(404).send({ error: 'Item not found.' });
  reply.header('content-disposition', `attachment; filename="keeptrail-${item.id}.json"`); return reply.send(JSON.stringify(item, null, 2));
});

const webDist = resolve(__dirname, '../../web/dist');
if (existsSync(webDist)) {
  await app.register(fastifyStatic, { root: webDist, prefix: '/' });
  app.setNotFoundHandler(async (_request, reply) => reply.sendFile('index.html'));
}

export async function startServer(port = Number(process.env.KEEPTRAIL_PORT ?? 4317)): Promise<void> {
  await app.listen({ host: '127.0.0.1', port });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer().catch((error) => { app.log.error(error); process.exit(1); });
}

export { app };
