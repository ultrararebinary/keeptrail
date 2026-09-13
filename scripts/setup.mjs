import { createHash, randomUUID } from 'node:crypto';
import { execFile as execFileCallback } from 'node:child_process';
import { chmod, mkdir, open, rename, rm, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';

const execFile = promisify(execFileCallback);
const repo = resolve(new URL('..', import.meta.url).pathname);
const tools = join(repo, '.tools');
const lockPath = join(tools, 'tools.lock.json');
const nodeVersion = '22.23.2';
const whisperVersion = 'v1.9.4';
const ytDlpVersion = '2026.8.19';
const omniVersion = '3.8.50';
const smallModel = { name: 'ggml-small.bin', url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin', bytes: 487601967, sha256: '1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b' };
function comparableVersion(value) { return String(value).split('.').map((part) => String(Number(part))).join('.'); }

async function command(file, args, options = {}) {
  const result = await execFile(file, args, { cwd: repo, maxBuffer: 8 * 1024 * 1024, ...options });
  return result.stdout.trim();
}

async function fileSha256(path) {
  const hash = createHash('sha256');
  let bytes = 0;
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on('data', (chunk) => { bytes += chunk.length; hash.update(chunk); });
    stream.on('end', resolvePromise);
    stream.on('error', reject);
  });
  return { bytes, sha256: hash.digest('hex') };
}

async function downloadVerified(url, destination, expected) {
  const partial = `${destination}.${randomUUID()}.partial`;
  await mkdir(resolve(destination, '..'), { recursive: true, mode: 0o700 });
  try {
    await command('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '2', '--output', partial, url]);
    const actual = await fileSha256(partial);
    if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) throw new Error(`Checksum mismatch for ${url}: expected ${expected.bytes}/${expected.sha256}, got ${actual.bytes}/${actual.sha256}.`);
    await rename(partial, destination);
    await chmod(destination, 0o600);
    return actual;
  } catch (error) {
    await rm(partial, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function modelManifest() {
  const url = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin';
  const response = await fetch('https://huggingface.co/api/models/ggerganov/whisper.cpp');
  if (!response.ok) throw new Error(`Hugging Face model metadata returned HTTP ${response.status}.`);
  const body = await response.json();
  const sibling = body.siblings?.find((entry) => entry.rfilename === 'ggml-base.bin');
  const lfs = sibling?.lfs;
  if (sibling?.rfilename && lfs?.size && lfs?.sha256) return { name: 'ggml-base.bin', url, bytes: lfs.size, sha256: lfs.sha256 };
  const head = await fetch(url, { method: 'HEAD', redirect: 'manual' });
  const bytes = Number(head.headers.get('x-linked-size') ?? head.headers.get('content-length'));
  const sha256 = (head.headers.get('x-linked-etag') ?? '').replaceAll('"', '').trim();
  if ((head.status < 200 || head.status >= 400) || !Number.isSafeInteger(bytes) || bytes <= 0 || !/^[a-f0-9]{64}$/i.test(sha256)) throw new Error('Official ggml-base.bin metadata did not include a usable size and SHA-256.');
  return { name: 'ggml-base.bin', url, bytes, sha256 };
}

async function withLock() {
  await mkdir(tools, { recursive: true, mode: 0o700 });
  let handle;
  try { handle = await open(join(tools, 'setup.lock'), 'wx', 0o600); }
  catch { throw new Error('Another Keeptrail setup is already running (.tools/setup.lock exists).'); }
  return async () => { await handle.close(); await rm(join(tools, 'setup.lock'), { force: true }); };
}

const failures = [];
const report = { node: { required: nodeVersion, detected: process.version }, python: null, ffmpeg: null, whisper: null, models: [], ytDlp: null, omniRoute: null, completedAt: null };

async function main() {
  const unlock = await withLock();
  try {
    if (process.version !== `v${nodeVersion}`) failures.push(`Node ${nodeVersion} is required; setup is running under ${process.version}. Run scripts/bootstrap.sh for the private pinned runtime.`);
    const python = process.env.KEEPTRAIL_PYTHON ?? 'python3';
    try {
      const version = await command(python, ['--version']);
      report.python = { executable: python, version };
      if (!/^Python 3\.12\./.test(version)) failures.push(`Python 3.12 is required; found ${version}.`);
      await command(python, ['-m', 'venv', join(tools, 'venv')]);
      const pip = join(tools, 'venv', 'bin', 'pip');
      const ytdlp = join(tools, 'venv', 'bin', 'yt-dlp');
      await command(pip, ['install', '--disable-pip-version-check', '--upgrade', `yt-dlp[default,curl-cffi]==${ytDlpVersion}`]);
      report.ytDlp = { executable: ytdlp, version: await command(ytdlp, ['--version']) };
      if (comparableVersion(report.ytDlp.version) !== comparableVersion(ytDlpVersion)) failures.push(`yt-dlp ${ytDlpVersion} was requested but ${report.ytDlp.version} is installed.`);
    } catch (error) { failures.push(error instanceof Error ? error.message : 'Python/yt-dlp setup failed.'); }

    try {
      await command('brew', ['install', 'ffmpeg']);
      const brew = await command('brew', ['--prefix', 'ffmpeg']);
      const ffmpeg = join(brew, 'bin', 'ffmpeg');
      const ffprobe = join(brew, 'bin', 'ffprobe');
      report.ffmpeg = { formulaPrefix: brew, ffmpeg, ffprobe, version: await command(ffmpeg, ['-version']) };
    } catch (error) {
      try {
        const brew = await command('brew', ['--prefix', 'ffmpeg']);
        report.ffmpeg = { formulaPrefix: brew, ffmpeg: join(brew, 'bin', 'ffmpeg'), ffprobe: join(brew, 'bin', 'ffprobe') };
      } catch { failures.push(error instanceof Error ? `Homebrew ffmpeg setup failed: ${error.message}` : 'Homebrew ffmpeg setup failed.'); }
    }

    const whisperSource = join(tools, 'whisper.cpp');
    const whisperBuild = join(whisperSource, 'build');
    try {
      try { await stat(join(whisperSource, '.git')); } catch { await command('git', ['clone', '--branch', whisperVersion, '--depth', '1', 'https://github.com/ggml-org/whisper.cpp.git', whisperSource]); }
      await command('cmake', ['-S', whisperSource, '-B', whisperBuild, '-DCMAKE_BUILD_TYPE=Release', '-DWHISPER_METAL=ON', '-DGGML_METAL=ON']);
      await command('cmake', ['--build', whisperBuild, '--config', 'Release', '--target', 'whisper-cli', '-j4']);
      const executable = join(whisperBuild, 'bin', 'whisper-cli');
      report.whisper = { version: whisperVersion, executable, metal: true };
    } catch (error) { failures.push(error instanceof Error ? `whisper.cpp setup failed: ${error.message}` : 'whisper.cpp setup failed.'); }

    try {
      const manifest = await modelManifest();
      for (const model of [smallModel, manifest]) {
        const destination = join(tools, 'models', model.name);
        const current = await fileSha256(destination).catch(() => null);
        if (!current || current.bytes !== model.bytes || current.sha256 !== model.sha256) await downloadVerified(model.url, destination, model);
        report.models.push({ ...model, path: destination });
      }
    } catch (error) { failures.push(error instanceof Error ? `Whisper model setup failed: ${error.message}` : 'Whisper model setup failed.'); }

    try {
      const prefix = join(tools, 'omniroute');
      await mkdir(prefix, { recursive: true, mode: 0o700 });
      await command('npm', ['install', '--prefix', prefix, '--omit=dev', `omniroute@${omniVersion}`]);
      report.omniRoute = { version: omniVersion, executable: join(prefix, 'node_modules', '.bin', 'omniroute'), prefix };
    } catch (error) { failures.push(error instanceof Error ? `OmniRoute setup failed: ${error.message}` : 'OmniRoute setup failed.'); }

    report.completedAt = new Date().toISOString();
    await writeFile(lockPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    if (failures.length) {
      process.stderr.write(`Keeptrail setup completed with ${failures.length} blocker(s):\n${failures.map((failure) => `- ${failure}`).join('\n')}\n`);
      process.exitCode = 1;
    } else process.stdout.write(`Keeptrail tools are ready. Versions recorded in ${lockPath}.\n`);
  } finally { await unlock(); }
}

main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
