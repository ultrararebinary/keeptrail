import { isIP } from 'node:net';
import { createHash, randomUUID } from 'node:crypto';

export type NormalizedSource = {
  url: string;
  canonicalUrl: string;
  platform: 'youtube' | 'instagram' | 'tiktok' | 'x' | 'web';
  platformId: string | null;
  reason?: never;
};

const blockedHosts = new Set(['localhost', 'localhost.localdomain', 'metadata.google.internal', 'metadata']);
const trackingParams = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'igshid', 'si', 'feature', 'ref']);

export function rejectPrivateHostname(hostname: string): string | null {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (blockedHosts.has(host) || host.endsWith('.localhost') || host.endsWith('.local')) return 'Local and private destinations are not allowed.';
  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    const parts = host.split('.').map(Number);
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b !== undefined && b >= 16 && b <= 31) || (a === 192 && b === 168)) {
      return 'Local and private destinations are not allowed.';
    }
  }
  if (ipVersion === 6 && (host === '::1' || host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:'))) return 'Local and private destinations are not allowed.';
  return null;
}

export function normalizeSource(raw: string): NormalizedSource {
  const parsed = new URL(raw.trim());
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only HTTP(S) links are supported.');
  if (parsed.username || parsed.password) throw new Error('Links with embedded credentials are not allowed.');
  if (parsed.port && !['80', '443'].includes(parsed.port)) throw new Error('Only ports 80 and 443 are supported.');
  const privateReason = rejectPrivateHostname(parsed.hostname);
  if (privateReason) throw new Error(privateReason);

  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
  const youtube = host === 'youtu.be' || host.endsWith('youtube.com');
  const instagram = host.endsWith('instagram.com');
  const tiktok = host.endsWith('tiktok.com');
  const x = host === 'x.com' || host === 'twitter.com' || host.endsWith('.x.com') || host.endsWith('.twitter.com');
  let platform: NormalizedSource['platform'] = 'web';
  let platformId: string | null = null;
  if (youtube) {
    platform = 'youtube';
    platformId = host === 'youtu.be' ? path.split('/')[1] ?? null : parsed.searchParams.get('v') ?? path.match(/\/(?:shorts|embed|live)\/([^/]+)/)?.[1] ?? null;
    if (!platformId) throw new Error('Paste an individual YouTube video or Short, not a channel or playlist.');
  } else if (instagram) {
    platform = 'instagram';
    platformId = path.match(/\/(?:reel|p|tv)\/([^/]+)/)?.[1] ?? null;
    if (!platformId) throw new Error('Paste an individual Instagram post or Reel.');
  } else if (tiktok) {
    platform = 'tiktok';
    platformId = path.match(/\/video\/(\d+)/)?.[1] ?? null;
    if (!platformId) throw new Error('Paste an individual TikTok video.');
  } else if (x) {
    platform = 'x';
    platformId = path.match(/\/status\/(\d+)/)?.[1] ?? null;
    if (!platformId) throw new Error('Paste an individual X post.');
  }
  const normalized = new URL(parsed.toString());
  normalized.hostname = host;
  normalized.pathname = path;
  if (platform === 'youtube' && platformId) normalized.pathname = `/${platformId}`;
  normalized.hash = '';
  if (platform === 'web') {
    [...normalized.searchParams.keys()].forEach((key) => { if (trackingParams.has(key)) normalized.searchParams.delete(key); });
  } else {
    normalized.search = '';
  }
  return { url: raw.trim(), canonicalUrl: normalized.toString(), platform, platformId };
}

export function contentHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function newId(): string {
  return randomUUID();
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, ' ').replace(/s$/, '');
}
