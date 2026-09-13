import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { spawn } from 'node:child_process';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, join, resolve } from 'node:path';

const execFile = promisify(execFileCallback);
const repo = resolve(new URL('..', import.meta.url).pathname);
const tools = join(repo, '.tools');
const args = process.argv.slice(2);
function value(flag) { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; }
const input = value('--input');
if (!input) { process.stderr.write('Usage: npm run benchmark:whisper -- --input <local-60-to-90-second-audio-or-video>\n'); process.exit(2); }
const inputPath = resolve(input);
const lockPath = join(tools, 'tools.lock.json');
let lock;
try { lock = JSON.parse(await readFile(lockPath, 'utf8')); } catch { process.stderr.write(`Missing ${lockPath}; run npm run setup first.\n`); process.exit(2); }
const whisperPath = lock.whisper?.executable ?? join(tools, 'whisper.cpp', 'build', 'bin', 'whisper-cli');
const models = lock.models ?? [];
if (!models.length || !await access(inputPath, constants.R_OK).then(() => true).catch(() => false)) { process.stderr.write('A readable local input and verified model entries are required; no benchmark was run.\n'); process.exit(2); }
const ffmpegPath = lock.ffmpeg?.ffmpeg ?? process.env.KEEPTRAIL_FFMPEG_PATH ?? 'ffmpeg';
let audioSeconds;
try { audioSeconds = Number((await execFile(lock.ffmpeg?.ffprobe ?? 'ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', inputPath], { maxBuffer: 1024 * 1024 })).stdout.trim()); } catch { audioSeconds = Number.NaN; }
if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) { process.stderr.write('ffprobe could not read a positive duration from the local input; no benchmark was run.\n'); process.exit(2); }

async function rssKb(pid) { try { const result = await execFile('/bin/ps', ['-p', String(pid), '-o', 'rss=']); return Number(result.stdout.trim()) || 0; } catch { return 0; } }
function runWhisper(modelPath, outputPrefix) { return new Promise((resolvePromise, reject) => { const child = spawn(whisperPath, ['-m', modelPath, '-f', inputPath, '-l', 'auto', '-t', '4', '-ojf', '-of', outputPrefix], { cwd: repo, shell: false, stdio: ['ignore', 'ignore', 'pipe'] }); let stderr = ''; let peak = 0; const sampler = setInterval(() => { void rssKb(child.pid).then((value) => { peak = Math.max(peak, value); }); }, 250); child.stderr.on('data', (chunk) => { stderr += String(chunk).slice(-10_000); }); const started = performance.now(); child.once('error', (error) => { clearInterval(sampler); reject(error); }); child.once('close', (code) => { clearInterval(sampler); resolvePromise({ code, wallSeconds: (performance.now() - started) / 1000, peakRssKb: peak, stderr }); }); }); }
const tempRoot = await mkdtemp(join(tools, 'benchmark-'));
const results = [];
try {
  for (const model of models.filter((entry) => entry.name === 'ggml-small.bin' || entry.name === 'ggml-base.bin')) {
    await access(model.path, constants.R_OK);
    const warmPrefix = join(tempRoot, `${model.name}-warm`);
    const warm = await runWhisper(model.path, warmPrefix);
    if (warm.code !== 0) throw new Error(`${model.name} warm-up failed: ${warm.stderr.slice(-500)}`);
    const runs = [];
    for (let index = 0; index < 3; index += 1) { const result = await runWhisper(model.path, join(tempRoot, `${model.name}-${index}`)); if (result.code !== 0) throw new Error(`${model.name} run ${index + 1} failed: ${result.stderr.slice(-500)}`); runs.push(result); }
    const sorted = runs.map((run) => run.wallSeconds).sort((a, b) => a - b);
    results.push({ name: model.name, modelSha256: model.sha256, modelBytes: model.bytes, medianWallSeconds: sorted[1], medianRtf: sorted[1] / audioSeconds, peakRssKb: Math.max(...runs.map((run) => run.peakRssKb)), runs: runs.map(({ wallSeconds, peakRssKb }) => ({ wallSeconds, peakRssKb })), wer: null });
  }
} catch (error) { await rm(tempRoot, { recursive: true, force: true }); process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exit(1); }
await rm(tempRoot, { recursive: true, force: true });
const report = { generatedAt: new Date().toISOString(), input: basename(inputPath), audioSeconds, ffmpegPath, whisperPath, results, referenceFixtures: 'Not present in this repository; WER is intentionally unmeasured.', selection: 'BENCHMARK_TARGET_NOT_MET: WER <=20% on both committed French and English fixtures is required before selecting a model.' };
await writeFile(join(tools, 'benchmark-whisper.json'), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
await writeFile(join(repo, 'docs', 'WHISPER_BENCHMARK.md'), `# Whisper benchmark\n\nGenerated ${report.generatedAt}. Input: ${report.input}; duration: ${audioSeconds.toFixed(2)} seconds.\n\n${results.map((result) => `- ${result.name}: median RTF ${result.medianRtf.toFixed(3)}, peak whisper RSS ${(result.peakRssKb / 1024).toFixed(1)} MiB, SHA-256 ${result.modelSha256}.`).join('\n')}\n\nWER was not measured because the required consented French and English reference fixtures are not present. ${report.selection}\n`);
process.stdout.write(`Measured ${results.length} Whisper model(s). Detailed report: ${join(repo, 'docs', 'WHISPER_BENCHMARK.md')}\n`);
