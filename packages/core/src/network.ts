import { createServer, request as httpRequest, type IncomingMessage, type Server } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP, connect as netConnect, type Socket } from 'node:net';
import { URL } from 'node:url';
import { rejectPrivateHostname } from './normalize.js';

export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
export const MAX_REDIRECTS = 5;

export type ResolvedDestination = { address: string; family: 4 | 6; port: number; hostname: string };
export type LookupAll = (hostname: string, options: { all: true; verbatim: true }) => Promise<Array<{ address: string; family: 4 | 6 }>>;

const defaultLookup: LookupAll = async (hostname, options) => (await dnsLookup(hostname, options)).map((entry) => ({ address: entry.address, family: entry.family as 4 | 6 }));

function ipv4Number(address: string): number | null {
  const parts = address.split('.');
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null;
  const numbers = parts.map(Number);
  if (numbers.some((part) => part > 255)) return null;
  return (((numbers[0]! * 256 + numbers[1]!) * 256 + numbers[2]!) * 256 + numbers[3]!) >>> 0;
}

function isReservedIpv4(address: string): boolean {
  const value = ipv4Number(address);
  if (value === null) return true;
  const inRange = (start: string, end: string): boolean => {
    const lower = ipv4Number(start)!;
    const upper = ipv4Number(end)!;
    return value >= lower && value <= upper;
  };
  return inRange('0.0.0.0', '0.255.255.255')
    || inRange('10.0.0.0', '10.255.255.255')
    || inRange('100.64.0.0', '100.127.255.255')
    || inRange('127.0.0.0', '127.255.255.255')
    || inRange('169.254.0.0', '169.254.255.255')
    || inRange('172.16.0.0', '172.31.255.255')
    || inRange('192.0.0.0', '192.0.0.255')
    || inRange('192.0.2.0', '192.0.2.255')
    || inRange('192.168.0.0', '192.168.255.255')
    || inRange('198.18.0.0', '198.19.255.255')
    || inRange('198.51.100.0', '198.51.100.255')
    || inRange('203.0.113.0', '203.0.113.255')
    || inRange('224.0.0.0', '255.255.255.255');
}

function normalizeAddress(address: string): string {
  const withoutZone = address.replace(/%.*$/, '').replace(/^\[|\]$/g, '').toLowerCase();
  const mapped = withoutZone.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  return mapped?.[1] ?? withoutZone;
}

export function isPublicAddress(address: string): boolean {
  const normalized = normalizeAddress(address);
  const family = isIP(normalized);
  if (family === 4) return !isReservedIpv4(normalized);
  if (family !== 6) return false;
  if (normalized === '::' || normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('ff') || normalized.startsWith('2001:db8:')) return false;
  return true;
}

export async function resolvePublicDestination(hostname: string, port: number, lookup: LookupAll = defaultLookup): Promise<ResolvedDestination> {
  const normalizedHost = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!Number.isInteger(port) || ![80, 443].includes(port)) throw new NetworkPolicyError('NETWORK_PORT_BLOCKED', 'Only public HTTP and HTTPS ports 80 and 443 are allowed.');
  if (rejectPrivateHostname(normalizedHost)) throw new NetworkPolicyError('NETWORK_HOST_BLOCKED', 'The destination resolves to a local or private host.');
  const literalFamily = isIP(normalizedHost);
  const addresses = literalFamily ? [{ address: normalizedHost, family: literalFamily as 4 | 6 }] : await lookup(normalizedHost, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address))) throw new NetworkPolicyError('NETWORK_DNS_BLOCKED', 'The destination has no exclusively public DNS answers.');
  const first = addresses[0]!;
  return { address: normalizeAddress(first.address), family: first.family, port, hostname: normalizedHost };
}

export class NetworkPolicyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'NetworkPolicyError';
  }
}

type ResponseData = { statusCode: number; headers: Record<string, string | undefined>; body: Buffer };

function readBounded(response: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    response.on('data', (chunk: Buffer | string) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buffer.length;
      if (total > limit) {
        response.destroy(new NetworkPolicyError('RESPONSE_TOO_LARGE', `The response exceeds the ${limit} byte limit.`));
        return;
      }
      chunks.push(buffer);
    });
    response.once('end', () => resolve(Buffer.concat(chunks)));
    response.once('error', reject);
  });
}

export async function requestValidated(url: URL, options: { maxBytes?: number; timeoutMs?: number; headers?: Record<string, string>; lookup?: LookupAll } = {}): Promise<ResponseData> {
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  const destination = await resolvePublicDestination(url.hostname, port, options.lookup);
  return new Promise((resolve, reject) => {
    const requestOptions = {
      protocol: url.protocol,
      hostname: destination.hostname,
      port: destination.port,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: { host: url.host, connection: 'close', ...options.headers },
      lookup: (_hostname: string, _options: import('node:dns').LookupOptions, callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void) => callback(null, destination.address, destination.family)
    };
    const request = url.protocol === 'https:' ? httpsRequest({ ...requestOptions, servername: destination.hostname }, (response) => {
      readBounded(response, options.maxBytes ?? MAX_PAGE_BYTES).then((body) => resolve({ statusCode: response.statusCode ?? 0, headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])) as Record<string, string | undefined>, body }), reject);
    }) : httpRequest(requestOptions, (response) => {
      readBounded(response, options.maxBytes ?? MAX_PAGE_BYTES).then((body) => resolve({ statusCode: response.statusCode ?? 0, headers: Object.fromEntries(Object.entries(response.headers).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value])) as Record<string, string | undefined>, body }), reject);
    });
    request.setTimeout(options.timeoutMs ?? 20_000, () => request.destroy(new NetworkPolicyError('NETWORK_TIMEOUT', 'The network request timed out.')));
    request.once('error', reject);
    request.end();
  });
}

export async function fetchReadablePage(rawUrl: string, options: { lookup?: LookupAll; maxBytes?: number } = {}): Promise<{ url: string; response: ResponseData }> {
  let url = new URL(rawUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await requestValidated(url, { maxBytes: options.maxBytes ?? MAX_PAGE_BYTES, lookup: options.lookup, headers: { accept: 'text/html,application/xhtml+xml' } });
    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
      if (redirect === MAX_REDIRECTS) throw new NetworkPolicyError('TOO_MANY_REDIRECTS', 'The source redirected too many times.');
      url = new URL(response.headers.location, url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new NetworkPolicyError('REDIRECT_SCHEME_BLOCKED', 'The source redirected to an unsupported scheme.');
      continue;
    }
    return { url: url.toString(), response };
  }
  throw new NetworkPolicyError('TOO_MANY_REDIRECTS', 'The source redirected too many times.');
}

function proxyCredentials(request: IncomingMessage): string | null {
  const value = request.headers['proxy-authorization'];
  if (typeof value !== 'string' || !value.startsWith('Basic ')) return null;
  return Buffer.from(value.slice(6), 'base64').toString('utf8');
}

function unauthorized(response: import('node:http').ServerResponse): void {
  response.writeHead(407, { 'proxy-authenticate': 'Basic realm="Keeptrail"', connection: 'close' });
  response.end('Proxy authentication required.');
}

export type EnforcingProxy = { url: string; port: number; close: () => Promise<void> };

export async function startEnforcingProxy(credentials: { username: string; password: string }, lookup: LookupAll = defaultLookup): Promise<EnforcingProxy> {
  const expected = `${credentials.username}:${credentials.password}`;
  const server: Server = createServer(async (request, response) => {
    if (proxyCredentials(request) !== expected) return unauthorized(response);
    let target: URL;
    try {
      target = new URL(request.url ?? '');
      if (target.protocol !== 'http:') throw new NetworkPolicyError('PROXY_SCHEME_BLOCKED', 'The proxy only accepts absolute HTTP requests or HTTPS CONNECT tunnels.');
      const destination = await resolvePublicDestination(target.hostname, Number(target.port || 80), lookup);
      const forwardedHeaders = { ...request.headers };
      delete forwardedHeaders['proxy-authorization'];
      delete forwardedHeaders.host;
      const outbound = httpRequest({ hostname: destination.hostname, port: destination.port, path: `${target.pathname}${target.search}`, method: request.method, headers: { ...forwardedHeaders, host: target.host }, lookup: (_host, _options, callback) => callback(null, destination.address, destination.family) }, (upstream) => { response.writeHead(upstream.statusCode ?? 502, upstream.headers); upstream.pipe(response); });
      outbound.once('error', (error) => { if (!response.headersSent) response.writeHead(502); response.end(error instanceof Error ? error.message : 'Proxy request failed.'); });
      request.pipe(outbound);
    } catch (error) {
      response.writeHead(error instanceof NetworkPolicyError ? 403 : 400);
      response.end(error instanceof Error ? error.message : 'Proxy request rejected.');
    }
  });
  server.on('connect', async (request, clientSocket, head) => {
    if (proxyCredentials(request) !== expected) {
      clientSocket.write('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic realm="Keeptrail"\r\n\r\n');
      clientSocket.destroy();
      return;
    }
    try {
      const [host, portText] = (request.url ?? '').startsWith('[') ? [request.url!.slice(1, request.url!.indexOf(']')), request.url!.split(':').at(-1)] : (request.url ?? '').split(':');
      const port = Number(portText);
      const destination = await resolvePublicDestination(host ?? '', port, lookup);
      const upstream: Socket = netConnect({ host: destination.address, port: destination.port, family: destination.family });
      upstream.once('connect', () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        if (head.length) upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      upstream.once('error', () => clientSocket.destroy());
      clientSocket.once('error', () => upstream.destroy());
    } catch {
      clientSocket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      clientSocket.destroy();
    }
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ host: '127.0.0.1', port: 0 }, () => resolve()); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('The enforcing proxy did not expose a loopback port.');
  return { port: address.port, url: `http://${encodeURIComponent(credentials.username)}:${encodeURIComponent(credentials.password)}@127.0.0.1:${address.port}`, close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())) };
}
