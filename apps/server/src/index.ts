import Fastify, { type FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, statSync } from 'node:fs';
import { chmod, mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  APP_VERSION, openDatabase, ensureDataDirectory, listLibrary, getItemDetail, importUrl, updateItem, graph, newId, contentHash
} from '@keeptrail/core';
import { ImportUrlsRequest, ItemDetail, LibraryResponse, Settings, UpdateItemRequest } from '@keeptrail/shared';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDirectory = ensureDataDirectory();
const db = openDatabase(dataDirectory);
const app = Fastify({ logger: { level: process.env.NODE_ENV === 'test' ? 'silent' : 'info' }, bodyLimit: 2 * 1024 * 1024 });

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

const geminiKeyPath = join(dataDirectory, 'config', 'gemini.key');

function resolveAssetPath(relativePath: string): string | null {
  const root = resolve(dataDirectory);
  const target = resolve(dataDirectory, relativePath);
  return target.startsWith(`${root}/`) ? target : null;
}

app.register(multipart, { limits: { files: 1, fileSize: 500 * 1024 * 1024 } });
app.addHook('preHandler', async (request, reply) => {
  if (['POST', 'PATCH', 'DELETE'].includes(request.method) && !isLocalOrigin(request)) return reply.code(403).send({ error: 'Cross-origin mutations are not allowed.' });
});

app.get('/api/health', async () => {
  const heartbeat = Date.parse(setting('worker_heartbeat', ''));
  return {
    ok: true,
    version: APP_VERSION,
    node: process.version,
    dataDirectory,
    database: 'ok',
    worker: Number.isFinite(heartbeat) && Date.now() - heartbeat < 5_000 ? 'online' : 'offline',
    gateway: setting('gemini_key_configured', '0') === '1' ? 'configured' : 'not_configured'
  };
});

app.get('/api/library', async (request, reply) => {
  const query = request.query as { q?: string; topic?: string; platform?: string; tag?: string; limit?: string; offset?: string };
  const result = LibraryResponse.parse(listLibrary(db, { query: query.q, topic: query.topic, platform: query.platform, tag: query.tag, limit: Number(query.limit) || 20, offset: Number(query.offset) || 0 }));
  return reply.send(result);
});

app.get('/api/items/:id', async (request, reply) => {
  const item = getItemDetail(db, (request.params as { id: string }).id);
  if (!item) return reply.code(404).send({ error: 'Item not found.' });
  return reply.send(ItemDetail.parse(item));
});

app.get('/api/graph', async (request) => {
  const query = request.query as { topic?: string; itemId?: string };
  return graph(db, query.topic || null, query.itemId || null);
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
  const id = randomUUID();
  const ext = (basename(part.filename).match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
  const rel = join('originals', `${id}${ext}`);
  const absolute = resolveAssetPath(rel);
  if (!absolute) return reply.code(400).send({ error: 'Invalid file path.' });
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  await pipeline(part.file, createWriteStream(absolute, { flags: 'wx', mode: 0o600 }));
  const stat = statSync(absolute);
  if (stat.size > 500 * 1024 * 1024) return reply.code(413).send({ error: 'This file is larger than 500 MiB.' });
  const bytes = await readFile(absolute);
  const hash = contentHash(bytes);
  const existing = db.prepare('SELECT id,status FROM items WHERE content_hash=?').get(hash) as { id: string; status: string } | undefined;
  if (existing) return reply.code(202).send({ existing: [{ id: existing.id, status: existing.status }], created: [], rejected: [] });
  const type = part.mimetype.startsWith('image/') ? 'image' : 'video';
  const now = new Date().toISOString();
  const itemId = randomUUID();
  db.transaction(() => {
    db.prepare(`INSERT INTO items (id,type,platform,source_url,canonical_url,title,description,status,created_at,content_hash) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(itemId, type, 'local', null, null, part.filename.slice(0, 160), '', 'queued', now, hash);
    db.prepare(`INSERT INTO assets (id,item_id,role,relative_path,mime,bytes,sha256,created_at) VALUES (?,?,?,?,?,?,?,?)`).run(id, itemId, 'original', rel, part.mimetype, stat.size, hash, now);
    db.prepare(`INSERT INTO jobs (id,item_id,stage,status,created_at,updated_at) VALUES (?,?,?,'queued',?,?)`).run(randomUUID(), itemId, type === 'image' ? 'analyze' : 'transcribe', now, now);
    db.prepare(`INSERT INTO search_chunks (id,item_id,source_kind,source_id,body,evidence_ids_json) VALUES (?,?,?,?,?,?)`).run(newId(), itemId, 'description', `description:${itemId}`, part.filename, JSON.stringify([`description:${itemId}`]));
  })();
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

app.get('/api/settings', async () => Settings.parse({
  hasGeminiKey: setting('gemini_key_configured', '0') === '1', browserSessionEnabled: setting('browser_session_enabled', '0') === '1',
  browserName: (setting('browser_name', '') || null) as 'chrome' | 'firefox' | null, dailyCloudCap: Number(setting('daily_cloud_cap', '30')),
  cloudCallsToday: Number(setting('cloud_calls_today', '0')), processingPaused: setting('processing_paused', '0') === '1', dataDirectory,
  gatewayStatus: setting('gemini_key_configured', '0') === '1' ? 'unavailable' : 'not_configured', model: 'gemini-2.5-flash-lite'
}));

app.patch('/api/settings', async (request, reply) => {
  const body = request.body as { geminiKey?: string | null; browserSessionEnabled?: boolean; browserName?: 'chrome' | 'firefox' | null; dailyCloudCap?: number; processingPaused?: boolean; billingAcknowledged?: boolean };
  if (body.geminiKey !== undefined) {
    if (body.geminiKey && body.geminiKey.length < 20) return reply.code(400).send({ error: 'That Gemini key looks too short.' });
    if (body.geminiKey) {
      await writeFile(geminiKeyPath, `${body.geminiKey.trim()}\n`, { encoding: 'utf8', mode: 0o600 });
      await chmod(geminiKeyPath, 0o600);
    } else if (body.geminiKey === null) {
      await unlink(geminiKeyPath).catch(() => undefined);
    }
    setSetting('gemini_key_configured', body.geminiKey ? '1' : '0');
    setSetting('billing_acknowledged', body.billingAcknowledged ? '1' : setting('billing_acknowledged', '0'));
  }
  if (body.browserSessionEnabled !== undefined) setSetting('browser_session_enabled', body.browserSessionEnabled ? '1' : '0');
  if (body.browserName !== undefined) setSetting('browser_name', body.browserName ?? '');
  if (body.dailyCloudCap !== undefined) { if (!Number.isInteger(body.dailyCloudCap) || body.dailyCloudCap < 1 || body.dailyCloudCap > 30) return reply.code(400).send({ error: 'The daily cap must be between 1 and 30.' }); setSetting('daily_cloud_cap', String(body.dailyCloudCap)); }
  if (body.processingPaused !== undefined) setSetting('processing_paused', body.processingPaused ? '1' : '0');
  return reply.send(Settings.parse({
    hasGeminiKey: setting('gemini_key_configured', '0') === '1', browserSessionEnabled: setting('browser_session_enabled', '0') === '1',
    browserName: (setting('browser_name', '') || null) as 'chrome' | 'firefox' | null, dailyCloudCap: Number(setting('daily_cloud_cap', '30')),
    cloudCallsToday: Number(setting('cloud_calls_today', '0')), processingPaused: setting('processing_paused', '0') === '1', dataDirectory,
    gatewayStatus: setting('gemini_key_configured', '0') === '1' ? 'unavailable' : 'not_configured', model: 'gemini-2.5-flash-lite'
  }));
});

app.post('/api/items/:id/original/delete', async (request, reply) => {
  const itemId = (request.params as { id: string }).id;
  const item = db.prepare(`SELECT id,status,original_deleted_at FROM items WHERE id=?`).get(itemId) as { id: string; status: string; original_deleted_at: string | null } | undefined;
  if (!item) return reply.code(404).send({ error: 'Item not found.' });
  if (item.status !== 'ready') return reply.code(409).send({ error: 'The original can only be removed after successful processing.' });
  const assets = db.prepare(`SELECT id,relative_path FROM assets WHERE item_id=? AND role='original'`).all(itemId) as Array<{ id: string; relative_path: string }>;
  for (const asset of assets) { const target = resolveAssetPath(asset.relative_path); if (target && existsSync(target)) { await readFile(target); const { unlink } = await import('node:fs/promises'); await unlink(target); } db.prepare('DELETE FROM assets WHERE id=?').run(asset.id); }
  db.prepare('UPDATE items SET original_deleted_at=? WHERE id=?').run(new Date().toISOString(), itemId);
  return reply.send({ ok: true, removedBytes: assets.length });
});

app.get('/api/assets/:id', async (request, reply) => {
  const asset = db.prepare('SELECT relative_path,mime FROM assets WHERE id=?').get((request.params as { id: string }).id) as { relative_path: string; mime: string } | undefined;
  if (!asset) return reply.code(404).send({ error: 'Asset not found.' });
  const target = resolveAssetPath(asset.relative_path);
  if (!target || !existsSync(target)) return reply.code(404).send({ error: 'Asset file not found.' });
  reply.type(asset.mime); return reply.send(createReadStream(target));
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
