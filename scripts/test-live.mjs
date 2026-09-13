import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const flags = ['instagram', 'youtube', 'tiktok', 'x'];
const supplied = flags.flatMap((platform) => { const index = process.argv.indexOf(`--${platform}`); return index >= 0 && process.argv[index + 1] ? [{ platform, url: process.argv[index + 1] }] : []; });
if (!supplied.length) { process.stderr.write('No live source was supplied; no external request was run. Example: npm run test:live -- --instagram <user-selected-url>\n'); process.exit(2); }
let core;
try { core = await import('../packages/core/dist/index.js'); } catch { process.stderr.write('Built core is unavailable. Run npm run build before the live gate.\n'); process.exit(2); }
const results = [];
for (const source of supplied) {
  try {
    const normalized = core.normalizeSource(source.url);
    if (normalized.platform !== source.platform) throw new Error(`URL normalized as ${normalized.platform}, not ${source.platform}.`);
    const metadata = await core.acquireSocialMetadata(normalized.url);
    const staging = await mkdtemp(join(tmpdir(), 'keeptrail-live-'));
    try {
      const downloaded = await core.downloadSocialVideo(normalized.url, staging);
      const file = await stat(downloaded.path);
      results.push({ platform: source.platform, status: 'download_passed', durationMs: metadata.durationMs, mediaCount: metadata.mediaCount, titlePresent: Boolean(metadata.title), bytes: file.size });
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  } catch (error) {
    results.push({ platform: source.platform, status: 'blocked_or_failed', code: error?.code ?? 'LIVE_TEST_FAILED', detail: error instanceof Error ? error.message : String(error) });
  }
}
process.stdout.write(`${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
process.exitCode = results.some((result) => result.status !== 'download_passed') ? 1 : 0;
