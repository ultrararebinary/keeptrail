import { randomUUID } from 'node:crypto';
import { mkdir, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { startEnforcingProxy, type EnforcingProxy } from './network.js';
import { runCommand, ToolExecutionError } from './media.js';
import { MAX_ORIGINAL_BYTES } from './assets.js';

export const MAX_VIDEO_DURATION_MS = 20 * 60_000;
export type SocialEntry = { id: string; url: string };
export type SocialMetadata = { id: string; title: string; uploader: string | null; description: string; durationMs: number | null; filesize: number | null; isLive: boolean; mediaCount: number; entries: SocialEntry[]; url: string };

export class AcquisitionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AcquisitionError';
  }
}

function parseMetadata(raw: string, url: string): SocialMetadata {
  let parsed: { id?: string; title?: string; uploader?: string; description?: string; duration?: number; filesize?: number; is_live?: boolean; entries?: unknown[] };
  try { parsed = JSON.parse(raw) as typeof parsed; } catch { throw new AcquisitionError('DOWNLOADER_INVALID_METADATA', 'yt-dlp returned invalid metadata.'); }
  const durationMs = Number.isFinite(parsed.duration) ? Math.round((parsed.duration ?? 0) * 1000) : null;
  const entries = (parsed.entries ?? []).flatMap((value, index): SocialEntry[] => {
    if (!value || typeof value !== 'object') return [];
    const entry = value as { id?: unknown; webpage_url?: unknown; original_url?: unknown; url?: unknown };
    const entryUrl = [entry.webpage_url, entry.original_url, entry.url].find((candidate): candidate is string => typeof candidate === 'string' && /^https?:\/\//i.test(candidate));
    return entryUrl ? [{ id: typeof entry.id === 'string' && entry.id ? entry.id : `${parsed.id ?? 'entry'}:${index}`, url: entryUrl }] : [];
  });
  const mediaCount = parsed.entries && parsed.entries.length > 0 ? parsed.entries.length : 1;
  const isX = /(^|\.)((x|twitter)\.com)$/i.test(new URL(url).hostname);
  if (parsed.is_live) throw new AcquisitionError('LIVE_STREAM_UNSUPPORTED', 'Live streams are not supported.');
  if (mediaCount > 1 && !isX) throw new AcquisitionError('CAROUSEL_UNSUPPORTED', 'This source contains multiple media entries; only individual videos are supported.');
  if (mediaCount > 1 && entries.length !== mediaCount) throw new AcquisitionError('X_MULTI_VIDEO_UNRESOLVED', `X returned ${mediaCount} media entries but not every child had a resolvable source URL.`);
  if (durationMs !== null && durationMs > MAX_VIDEO_DURATION_MS) throw new AcquisitionError('VIDEO_TOO_LONG', 'Videos longer than 20 minutes are not supported.');
  if (parsed.filesize !== undefined && parsed.filesize > MAX_ORIGINAL_BYTES) throw new AcquisitionError('VIDEO_TOO_LARGE', 'Videos larger than 500 MiB are not supported.');
  if (!parsed.id) throw new AcquisitionError('DOWNLOADER_INVALID_METADATA', 'yt-dlp did not return a content ID.');
  return { id: parsed.id, title: String(parsed.title ?? '').slice(0, 160), uploader: parsed.uploader ? String(parsed.uploader).slice(0, 160) : null, description: String(parsed.description ?? '').slice(0, 4_000), durationMs, filesize: parsed.filesize ?? null, isLive: Boolean(parsed.is_live), mediaCount, entries, url };
}

function downloaderPath(): string { return process.env.KEEPTRAIL_YTDLP_PATH ?? join(process.cwd(), '.tools', 'venv', 'bin', 'yt-dlp'); }

async function withProxy<T>(lookup: Parameters<typeof startEnforcingProxy>[1] | undefined, callback: (proxy: EnforcingProxy) => Promise<T>): Promise<T> {
  const proxy = await startEnforcingProxy({ username: `keeptrail-${randomUUID()}`, password: randomUUID() }, lookup);
  try { return await callback(proxy); } finally { await proxy.close(); }
}

export async function acquireSocialMetadata(url: string, options: { ytDlpPath?: string; lookup?: Parameters<typeof startEnforcingProxy>[1] } = {}): Promise<SocialMetadata> {
  return withProxy(options.lookup, async (proxy) => {
    try {
      const result = await runCommand(options.ytDlpPath ?? downloaderPath(), ['--dump-single-json', '--no-playlist', '--skip-download', '--no-warnings', '--socket-timeout', '60', '--retries', '2', '--extractor-retries', '2', '--max-filesize', '500M', '--js-runtimes', `node:${process.execPath}`, '--proxy', proxy.url, url], { timeoutMs: 60_000, maxOutputBytes: 2_000_000 });
      return parseMetadata(result.stdout, url);
    } catch (error) {
      if (error instanceof AcquisitionError) throw error;
      if (error instanceof ToolExecutionError && error.code === 'TOOL_MISSING') throw new AcquisitionError('YTDLP_MISSING', 'yt-dlp is not installed. Run npm run setup, then npm run doctor.');
      throw new AcquisitionError('SOCIAL_DOWNLOAD_FAILED', error instanceof Error ? error.message.slice(0, 240) : 'The social source could not be acquired.');
    }
  });
}

export async function downloadSocialVideo(url: string, outputDirectory: string, options: { ytDlpPath?: string; lookup?: Parameters<typeof startEnforcingProxy>[1] } = {}): Promise<{ path: string; metadata: SocialMetadata }> {
  await mkdir(outputDirectory, { recursive: true, mode: 0o700 });
  return withProxy(options.lookup, async (proxy) => {
    const outputTemplate = join(outputDirectory, '%(id)s.%(ext)s');
    try {
      const result = await runCommand(options.ytDlpPath ?? downloaderPath(), ['--no-playlist', '--no-warnings', '--restrict-filenames', '--format', 'bestvideo[height<=720]+bestaudio/best[height<=720]/best', '--merge-output-format', 'mp4', '--fragment-retries', '2', '--retries', '2', '--concurrent-fragments', '1', '--max-filesize', '500M', '--max-downloads', '1', '--socket-timeout', '60', '--js-runtimes', `node:${process.execPath}`, '--proxy', proxy.url, '--paths', outputDirectory, '--output', outputTemplate, '--print-json', '--print', 'after_move:filepath', url], { timeoutMs: 15 * 60_000, maxOutputBytes: 2_000_000 });
      const lines = result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
      const metadataLine = lines.find((line) => line.startsWith('{'));
      const pathLine = lines.find((line) => !line.startsWith('{') && line !== '[download]');
      if (!metadataLine || !pathLine) throw new AcquisitionError('DOWNLOADER_OUTPUT_MISSING', 'yt-dlp completed without JSON metadata and a local media path.');
      const metadata = parseMetadata(metadataLine, url);
      const path = isAbsolute(pathLine) ? pathLine : resolve(outputDirectory, pathLine);
      const outputRoot = resolve(outputDirectory);
      if (!path.startsWith(`${outputRoot}/`)) throw new AcquisitionError('DOWNLOADER_PATH_INVALID', 'yt-dlp returned a path outside the owned staging directory.');
      const file = await stat(path).catch(() => null);
      if (!file || !file.isFile()) throw new AcquisitionError('DOWNLOADER_OUTPUT_MISSING', 'yt-dlp completed without a readable local media file.');
      if (file.size > MAX_ORIGINAL_BYTES) throw new AcquisitionError('VIDEO_TOO_LARGE', 'The downloaded video exceeds 500 MiB.');
      return { path, metadata };
    } catch (error) {
      if (error instanceof AcquisitionError) throw error;
      if (error instanceof ToolExecutionError && error.code === 'TOOL_MISSING') throw new AcquisitionError('YTDLP_MISSING', 'yt-dlp is not installed. Run npm run setup, then npm run doctor.');
      throw new AcquisitionError('SOCIAL_DOWNLOAD_FAILED', error instanceof Error ? error.message.slice(0, 240) : 'The social source could not be downloaded.');
    }
  });
}
