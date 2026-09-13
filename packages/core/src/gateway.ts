import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import type { ProviderId } from '@keeptrail/shared';
import { providerModels } from './providers.js';

export const MANAGED_GATEWAY_PORT = 20129;
const GATEWAY_HOST = '127.0.0.1';

export class GatewaySupervisorError extends Error {
  constructor(public readonly code: 'GATEWAY_MISSING' | 'GATEWAY_PORT_OCCUPIED' | 'GATEWAY_START_FAILED' | 'GATEWAY_UNAVAILABLE', message: string) {
    super(message);
    this.name = 'GatewaySupervisorError';
  }
}

type GatewayState = { pid: number; provider: ProviderId; connectionId: string; inferenceKeyId: string; startedAt: string };
type GatewayOptions = { provider: ProviderId; providerKey: string; toolsDirectory?: string; timeoutMs?: number };
type GatewayResult = { status: 'healthy' | 'starting'; apiKey: string; model: string; pid: number | null };
type ProviderConnection = { id?: unknown; provider?: unknown; authType?: unknown; isActive?: unknown };

function gatewayDirectory(dataDirectory: string): string { return join(dataDirectory, 'gateway'); }
function statePath(dataDirectory: string): string { return join(gatewayDirectory(dataDirectory), 'state.json'); }
function apiKeyPath(dataDirectory: string): string { return join(gatewayDirectory(dataDirectory), 'api-key'); }
function binaryPath(toolsDirectory = process.env.KEEPTRAIL_TOOLS_DIR ?? join(process.cwd(), '.tools')): string { return process.env.KEEPTRAIL_OMNIROUTE_BIN ?? join(toolsDirectory, 'omniroute', 'node_modules', '.bin', 'omniroute'); }

async function readState(dataDirectory: string): Promise<GatewayState | null> {
  try { return JSON.parse(await readFile(statePath(dataDirectory), 'utf8')) as GatewayState; } catch { return null; }
}

async function processCommand(pid: number): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('/bin/ps', ['-p', String(pid), '-o', 'command='], { stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += String(chunk); });
    child.once('close', () => resolve(output.trim()));
    child.once('error', () => resolve(''));
  });
}

async function ownedProcess(state: GatewayState | null, executable: string): Promise<boolean> {
  if (!state || !Number.isInteger(state.pid) || state.pid <= 0) return false;
  try { process.kill(state.pid, 0); } catch { return false; }
  const command = await processCommand(state.pid);
  return command.includes(executable) && command.includes(String(MANAGED_GATEWAY_PORT));
}

async function portOpen(): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: GATEWAY_HOST, port: MANAGED_GATEWAY_PORT });
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.setTimeout(750, () => { socket.destroy(); resolve(false); });
  });
}

async function probeGateway(apiKey: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetch(`http://${GATEWAY_HOST}:${MANAGED_GATEWAY_PORT}/v1/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: controller.signal });
    return response.status >= 200 && response.status < 500;
  } catch { return false; } finally { clearTimeout(timer); }
}

async function stopOwned(state: GatewayState | null, executable: string): Promise<void> {
  if (!await ownedProcess(state, executable)) return;
  try { process.kill(-(state!.pid), 'SIGTERM'); } catch { try { process.kill(state!.pid, 'SIGTERM'); } catch { /* already gone */ } }
}

async function ensureApiKey(dataDirectory: string): Promise<string> {
  await mkdir(gatewayDirectory(dataDirectory), { recursive: true, mode: 0o700 });
  try {
    const existing = (await readFile(apiKeyPath(dataDirectory), 'utf8')).trim();
    if (existing) return existing;
  } catch { /* create below */ }
  const value = `kt_${randomBytes(32).toString('hex')}`;
  await writeFile(apiKeyPath(dataDirectory), `${value}\n`, { flag: 'wx', mode: 0o600 }).catch(async () => undefined);
  const persisted = (await readFile(apiKeyPath(dataDirectory), 'utf8')).trim();
  await chmod(apiKeyPath(dataDirectory), 0o600);
  return persisted || value;
}

async function ensureSecret(dataDirectory: string, filename: string, prefix: string): Promise<string> {
  const path = join(gatewayDirectory(dataDirectory), filename);
  try {
    const existing = (await readFile(path, 'utf8')).trim();
    if (existing) return existing;
  } catch { /* create below */ }
  const value = `${prefix}${randomBytes(32).toString('hex')}`;
  await writeFile(path, `${value}\n`, { flag: 'wx', mode: 0o600 }).catch(() => undefined);
  const persisted = (await readFile(path, 'utf8')).trim();
  await chmod(path, 0o600);
  return persisted || value;
}

async function runCli(executable: string, args: string[], env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: env.HOME, env, shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    let outputTooLarge = false;
    child.stdout.on('data', (chunk) => {
      if (outputTooLarge) return;
      output += String(chunk);
      if (Buffer.byteLength(output, 'utf8') > 500_000) {
        outputTooLarge = true;
        try { child.kill('SIGTERM'); } catch { /* already gone */ }
      }
    });
    child.once('error', () => reject(new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute CLI could not start.')));
    child.once('close', (code) => {
      if (outputTooLarge || code !== 0) reject(new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute CLI returned an invalid result.'));
      else resolve(output);
    });
  });
}

async function configureProviderKey(executable: string, env: Record<string, string>, provider: ProviderId, providerKey: string): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ['keys', 'add', provider, '--stdin'], {
      cwd: env.HOME,
      env: { ...env, OMNIROUTE_BASE_URL: 'http://127.0.0.1:1', PORT: String(MANAGED_GATEWAY_PORT) },
      stdio: ['pipe', 'ignore', 'ignore']
    });
    child.once('error', () => reject(new GatewaySupervisorError('GATEWAY_START_FAILED', 'OmniRoute provider-key setup could not start.')));
    child.once('close', (code) => code === 0 ? resolve() : reject(new GatewaySupervisorError('GATEWAY_START_FAILED', 'OmniRoute provider-key setup failed.')));
    child.stdin.end(`${providerKey}\n`);
  });
  let listed: { providers?: ProviderConnection[] };
  try { listed = JSON.parse(await runCli(executable, ['providers', 'list', '--json'], { ...env, OMNIROUTE_BASE_URL: 'http://127.0.0.1:1', PORT: String(MANAGED_GATEWAY_PORT) })) as { providers?: ProviderConnection[] }; }
  catch { throw new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute provider listing was not valid JSON.'); }
  const connections = Array.isArray(listed.providers) ? listed.providers : [];
  const selected = connections.filter((entry) => entry.provider === provider && entry.authType === 'apikey' && entry.isActive !== false && typeof entry.id === 'string');
  if (selected.length !== 1) throw new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute did not create exactly one active selected-provider connection.');
  const unexpectedProviders = [...new Set(connections.filter((entry) => entry.id !== selected[0]!.id && entry.isActive !== false && typeof entry.provider === 'string').map((entry) => entry.provider as string))];
  for (const unexpectedProvider of unexpectedProviders) await runCli(executable, ['keys', 'remove', unexpectedProvider, '--yes'], { ...env, OMNIROUTE_BASE_URL: 'http://127.0.0.1:1', PORT: String(MANAGED_GATEWAY_PORT) });
  return selected[0]!.id as string;
}

function isUuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }

async function createRestrictedInferenceKey(provider: ProviderId, model: string, managementKey: string, connectionId: string): Promise<{ key: string; id: string }> {
  const headers = { authorization: `Bearer ${managementKey}`, 'content-type': 'application/json' };
  const createdResponse = await fetch(`http://${GATEWAY_HOST}:${MANAGED_GATEWAY_PORT}/api/keys`, { method: 'POST', headers, body: JSON.stringify({ name: 'Keeptrail local inference', allowedConnections: [connectionId] }) });
  if (!createdResponse.ok) throw new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute could not create its local inference credential.');
  let created: { key?: unknown; id?: unknown; allowedConnections?: unknown };
  try { created = await createdResponse.json() as typeof created; } catch { throw new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute returned an invalid local credential response.'); }
  if (typeof created.key !== 'string' || !isUuid(created.id) || !Array.isArray(created.allowedConnections) || !created.allowedConnections.includes(connectionId)) throw new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute returned an unscoped local credential.');
  const policyResponse = await fetch(`http://${GATEWAY_HOST}:${MANAGED_GATEWAY_PORT}/api/keys/${encodeURIComponent(created.id)}`, { method: 'PATCH', headers, body: JSON.stringify({ modelAccessMode: 'restricted', allowedModels: [model], allowedConnections: [connectionId], allowedEndpoints: ['/v1/chat/completions'], noLog: true, compressionEnabled: false, streamDefaultMode: 'legacy' }) });
  if (!policyResponse.ok) throw new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute could not restrict its local inference credential.');
  let policy: { modelAccessMode?: unknown; allowedModels?: unknown; allowedConnections?: unknown };
  try { policy = await policyResponse.json() as typeof policy; } catch { throw new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute returned an invalid credential policy response.'); }
  if (policy.modelAccessMode !== 'restricted' || !Array.isArray(policy.allowedModels) || policy.allowedModels.length !== 1 || policy.allowedModels[0] !== model || !Array.isArray(policy.allowedConnections) || policy.allowedConnections.length !== 1 || policy.allowedConnections[0] !== connectionId) throw new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute did not confirm the exact local credential restriction.');
  return { key: created.key, id: created.id };
}

async function persistInferenceKey(dataDirectory: string, key: string): Promise<void> {
  const path = join(gatewayDirectory(dataDirectory), 'inference-key');
  await writeFile(path, `${key}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
}

async function readInferenceKeyFile(dataDirectory: string): Promise<string | null> {
  try { const value = (await readFile(join(gatewayDirectory(dataDirectory), 'inference-key'), 'utf8')).trim(); return value || null; } catch { return null; }
}

export async function ensureManagedGateway(dataDirectory: string, options: GatewayOptions): Promise<GatewayResult> {
  const executable = binaryPath(options.toolsDirectory);
  const managementKey = await ensureApiKey(dataDirectory);
  const previous = await readState(dataDirectory);
  const existingInferenceKey = await readInferenceKeyFile(dataDirectory);
  if (previous?.provider === options.provider && previous.connectionId && previous.inferenceKeyId && existingInferenceKey && await ownedProcess(previous, executable) && await probeGateway(managementKey)) return { status: 'healthy', apiKey: existingInferenceKey, model: providerModels[options.provider], pid: previous.pid };
  if (await portOpen() && !await ownedProcess(previous, executable)) throw new GatewaySupervisorError('GATEWAY_PORT_OCCUPIED', `Managed gateway port ${MANAGED_GATEWAY_PORT} is occupied by an unmanaged process.`);
  if (!existsSync(executable)) throw new GatewaySupervisorError('GATEWAY_MISSING', `Managed OmniRoute binary is missing at ${executable}. Run npm run setup.`);
  if (previous && await ownedProcess(previous, executable)) await stopOwned(previous, executable);
  const privateData = join(gatewayDirectory(dataDirectory), 'data');
  const privateHome = join(gatewayDirectory(dataDirectory), 'home');
  const storageEncryptionKey = await ensureSecret(dataDirectory, 'storage-key', 'kt_store_');
  await mkdir(privateData, { recursive: true, mode: 0o700 });
  await mkdir(privateHome, { recursive: true, mode: 0o700 });
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/(API_KEY|TOKEN|PASSWORD|SECRET|PROXY|OMNIROUTE|OPENAI|MISTRAL|GROQ|GEMINI|GOOGLE|OPENROUTER|ANTHROPIC)/i.test(key))) as Record<string, string>;
  const childEnv = {
    ...inherited,
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    HOME: privateHome,
    DATA_DIR: privateData,
    OMNIROUTE_SERVER_HOST: GATEWAY_HOST,
    OMNIROUTE_PORT: String(MANAGED_GATEWAY_PORT),
    OMNIROUTE_BASE_URL: `http://${GATEWAY_HOST}:${MANAGED_GATEWAY_PORT}`,
    PORT: String(MANAGED_GATEWAY_PORT),
    API_PORT: String(MANAGED_GATEWAY_PORT),
    DASHBOARD_PORT: String(MANAGED_GATEWAY_PORT),
    OMNIROUTE_API_KEY: managementKey,
    STORAGE_ENCRYPTION_KEY: storageEncryptionKey,
    JWT_SECRET: `kt_jwt_${randomBytes(32).toString('hex')}`,
    API_KEY_SECRET: `kt_api_${randomBytes(32).toString('hex')}`,
    INITIAL_PASSWORD: `kt_pw_${randomBytes(24).toString('hex')}`,
    OMNIROUTE_DISABLE_CREDENTIAL_HEALTH_CHECK: 'true',
    OMNIROUTE_ENABLE_LIVE_WS: '0',
    OMNIROUTE_CLI_SKIP_REPO_ENV: '1',
  };
  const connectionId = await configureProviderKey(executable, childEnv, options.provider, options.providerKey);
  const child = spawn(executable, ['serve', '--port', String(MANAGED_GATEWAY_PORT), '--no-open', '--no-tray'], { cwd: privateHome, env: childEnv, detached: true, stdio: 'ignore' });
  if (!child.pid) throw new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute did not return a process id.');
  child.unref();
  const state: GatewayState = { pid: child.pid, provider: options.provider, connectionId, inferenceKeyId: '', startedAt: new Date().toISOString() };
  await writeFile(statePath(dataDirectory), `${JSON.stringify(state)}\n`, { mode: 0o600 });
  const deadline = Date.now() + (options.timeoutMs ?? 20_000);
  try {
    while (Date.now() < deadline) {
      if (await probeGateway(managementKey)) {
        const inference = await createRestrictedInferenceKey(options.provider, providerModels[options.provider], managementKey, connectionId);
        await persistInferenceKey(dataDirectory, inference.key);
        await writeFile(statePath(dataDirectory), `${JSON.stringify({ ...state, inferenceKeyId: inference.id })}\n`, { mode: 0o600 });
        return { status: 'healthy', apiKey: inference.key, model: providerModels[options.provider], pid: child.pid };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (await portOpen()) throw new GatewaySupervisorError('GATEWAY_UNAVAILABLE', 'Managed OmniRoute started but did not pass its loopback health probe.');
    throw new GatewaySupervisorError('GATEWAY_START_FAILED', 'Managed OmniRoute exited or could not bind its loopback port.');
  } catch (error) {
    await stopOwned(state, executable);
    throw error;
  }
}

export async function managedGatewayStatus(dataDirectory: string): Promise<{ running: boolean; status: 'healthy' | 'unavailable' | 'not_configured'; pid: number | null }> {
  const key = await ensureApiKey(dataDirectory);
  const state = await readState(dataDirectory);
  const executable = binaryPath();
  if (await ownedProcess(state, executable) && await probeGateway(key)) return { running: true, status: 'healthy', pid: state?.pid ?? null };
  return { running: false, status: existsSync(binaryPath()) ? 'unavailable' : 'not_configured', pid: state?.pid ?? null };
}
