import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, mkdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';
import sharp from 'sharp';
import type { FrameCandidate } from './frames.js';

export class ToolExecutionError extends Error {
  constructor(public readonly code: 'TOOL_MISSING' | 'TOOL_FAILED' | 'TOOL_TIMEOUT' | 'TOOL_OUTPUT_LIMIT', message: string, public readonly stderr = '') {
    super(message);
    this.name = 'ToolExecutionError';
  }
}

export type CommandResult = { stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null; durationMs: number };

function killProcess(child: ChildProcessWithoutNullStreams): void {
  if (!child.pid) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  setTimeout(() => { try { process.kill(-child.pid!, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }, 5_000).unref();
}

export function runCommand(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number; maxOutputBytes?: number; signal?: AbortSignal; onChild?: (child: ChildProcessWithoutNullStreams) => void } = {}): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'] }) as unknown as ChildProcessWithoutNullStreams;
    } catch {
      reject(new ToolExecutionError('TOOL_MISSING', `Required executable ${basename(command)} is not available.`));
      return;
    }
    options.onChild?.(child);
    const maxOutputBytes = options.maxOutputBytes ?? 1_000_000;
    let stdout = '';
    let stderr = '';
    let outputTooLarge = false;
    const collect = (target: 'stdout' | 'stderr') => (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + Buffer.byteLength(text) > maxOutputBytes) {
        outputTooLarge = true;
        killProcess(child);
        return;
      }
      if (target === 'stdout') stdout += text; else stderr += text;
    };
    child.stdout.on('data', collect('stdout'));
    child.stderr.on('data', collect('stderr'));
    const timeout = setTimeout(() => { killProcess(child); }, options.timeoutMs ?? 60_000);
    const abort = () => killProcess(child);
    options.signal?.addEventListener('abort', abort, { once: true });
    child.once('error', (error) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      reject(new ToolExecutionError('TOOL_MISSING', `Required executable ${basename(command)} is not available.`, error.message));
    });
    child.once('close', (code, signal) => {
      clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      const durationMs = Date.now() - started;
      if (outputTooLarge) { reject(new ToolExecutionError('TOOL_OUTPUT_LIMIT', `Executable ${basename(command)} exceeded the output limit.`, stderr)); return; }
      if (options.signal?.aborted) { reject(new ToolExecutionError('TOOL_FAILED', `Executable ${basename(command)} was canceled.`, stderr)); return; }
      if (code !== 0) {
        const timedOut = options.timeoutMs !== undefined && durationMs >= options.timeoutMs;
        reject(new ToolExecutionError(timedOut ? 'TOOL_TIMEOUT' : 'TOOL_FAILED', `${basename(command)} failed with exit code ${code ?? signal ?? 'unknown'}.`, stderr.slice(-4_000)));
        return;
      }
      resolve({ stdout, stderr, code, signal, durationMs });
    });
  });
}

export type MediaProbe = { durationMs: number; hasAudio: boolean; hasVideo: boolean; width: number | null; height: number | null; rotation: number };

const MAX_CAPTURE_BYTES = 512 * 1024 * 1024;

async function directoryByteSize(directory: string): Promise<number> {
  const entries = await readdir(directory, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    if (entry.isFile()) total += (await stat(join(directory, entry.name))).size;
  }
  return total;
}

export async function probeMedia(inputPath: string, ffprobePath = process.env.KEEPTRAIL_FFPROBE_PATH ?? 'ffprobe'): Promise<MediaProbe> {
  const result = await runCommand(ffprobePath, ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', inputPath], { timeoutMs: 60_000 });
  let parsed: { format?: { duration?: string }; streams?: Array<{ codec_type?: string; width?: number; height?: number; tags?: { rotate?: string }; side_data_list?: Array<{ rotation?: number }> }> };
  try { parsed = JSON.parse(result.stdout) as typeof parsed; } catch { throw new ToolExecutionError('TOOL_FAILED', 'ffprobe returned invalid JSON.'); }
  const duration = Number(parsed.format?.duration ?? 0);
  const video = parsed.streams?.find((stream) => stream.codec_type === 'video');
  const rotation = Number(video?.tags?.rotate ?? video?.side_data_list?.find((data) => data.rotation !== undefined)?.rotation ?? 0);
  return { durationMs: Math.round(duration * 1000), hasAudio: Boolean(parsed.streams?.some((stream) => stream.codec_type === 'audio')), hasVideo: Boolean(video), width: video?.width ?? null, height: video?.height ?? null, rotation: Number.isFinite(rotation) ? rotation : 0 };
}

export async function normalizeAudio(inputPath: string, outputPath: string, ffmpegPath = process.env.KEEPTRAIL_FFMPEG_PATH ?? 'ffmpeg'): Promise<void> {
  await runCommand(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-threads', '2', '-i', inputPath, '-vn', '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', '-f', 'wav', '-y', outputPath], { timeoutMs: 10 * 60_000, maxOutputBytes: 200_000 });
}

async function normalizedJpeg(inputPath: string, outputPath: string, width: number, quality: number): Promise<void> {
  await sharp(inputPath).rotate().resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).jpeg({ quality, mozjpeg: false }).toFile(outputPath);
}

async function frameDifference(path: string, previous: Buffer | null): Promise<{ signature: Buffer; difference: number }> {
  const signature = await sharp(path).rotate().resize({ width: 64, height: 64, fit: 'fill' }).greyscale().raw().toBuffer();
  if (!previous) return { signature, difference: 1 };
  let difference = 0;
  for (let index = 0; index < Math.min(signature.length, previous.length); index += 1) difference += Math.abs(signature[index]! - previous[index]!);
  return { signature, difference: difference / (Math.min(signature.length, previous.length) * 255) };
}

export async function extractCandidateFrames(inputPath: string, outputDirectory: string, durationMs: number, ffmpegPath = process.env.KEEPTRAIL_FFMPEG_PATH ?? 'ffmpeg'): Promise<FrameCandidate[]> {
  const frameDirectory = join(outputDirectory, 'candidates');
  await mkdir(frameDirectory, { recursive: true, mode: 0o700 });
  await runCommand(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-threads', '2', '-i', inputPath, '-vf', 'fps=2', '-frames:v', String(Math.min(2_400, Math.floor(durationMs / 500) + 1)), '-q:v', '3', '-y', join(frameDirectory, 'frame-%06d.jpg')], { timeoutMs: 15 * 60_000, maxOutputBytes: 200_000 });
  if (await directoryByteSize(frameDirectory) > MAX_CAPTURE_BYTES) throw new ToolExecutionError('TOOL_OUTPUT_LIMIT', 'Candidate captures exceeded the 512 MiB storage limit.');
  const sourceFrames = (await readdir(frameDirectory)).filter((name) => name.startsWith('frame-') && name.endsWith('.jpg')).sort();
  if (!sourceFrames.length) throw new ToolExecutionError('TOOL_FAILED', 'FFmpeg did not produce any candidate frames.');
  const candidates: FrameCandidate[] = [];
  let previous: Buffer | null = null;
  for (let index = 0; index < Math.min(sourceFrames.length, 2_400); index += 1) {
    const sourcePath = join(frameDirectory, sourceFrames[index]!);
    const outputPath = join(frameDirectory, `normalized-${String(index).padStart(6, '0')}.jpg`);
    await normalizedJpeg(sourcePath, outputPath, 1280, 82);
    if (await directoryByteSize(frameDirectory) > MAX_CAPTURE_BYTES) throw new ToolExecutionError('TOOL_OUTPUT_LIMIT', 'Candidate captures exceeded the 512 MiB storage limit.');
    let bytes = (await stat(outputPath)).size;
    for (const quality of [70, 60]) {
      if (bytes <= 1_048_576) break;
      await normalizedJpeg(sourcePath, outputPath, 1280, quality);
      if (await directoryByteSize(frameDirectory) > MAX_CAPTURE_BYTES) throw new ToolExecutionError('TOOL_OUTPUT_LIMIT', 'Candidate captures exceeded the 512 MiB storage limit.');
      bytes = (await stat(outputPath)).size;
    }
    for (const width of [1024, 768]) {
      if (bytes <= 1_048_576) break;
      await normalizedJpeg(sourcePath, outputPath, width, 60);
      if (await directoryByteSize(frameDirectory) > MAX_CAPTURE_BYTES) throw new ToolExecutionError('TOOL_OUTPUT_LIMIT', 'Candidate captures exceeded the 512 MiB storage limit.');
      bytes = (await stat(outputPath)).size;
    }
    if (bytes > 1_048_576) throw new ToolExecutionError('TOOL_OUTPUT_LIMIT', 'A normalized capture exceeds the 1 MiB image limit.');
    const signature = await frameDifference(outputPath, previous);
    previous = signature.signature;
    candidates.push({ timestampMs: Math.min(durationMs, index * 500), difference: signature.difference, path: outputPath, sha256: await fileSha256(outputPath) });
  }
  return candidates;
}

function parseTimestamp(value: unknown, numericUnit: 'seconds' | 'milliseconds' = 'seconds'): number {
  if (typeof value === 'number') return Math.max(0, Math.round(numericUnit === 'seconds' ? value * 1000 : value));
  if (typeof value !== 'string') return 0;
  const normalized = value.trim().replace(',', '.');
  const parts = normalized.split(':').map(Number);
  if (parts.length === 3 && parts.every(Number.isFinite)) return Math.max(0, Math.round((parts[0]! * 3600 + parts[1]! * 60 + parts[2]!) * 1000));
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parseTimestamp(parsed, numericUnit) : 0;
}

export type ParsedTranscriptSegment = { text: string; startMs: number; endMs: number; language: string | null };

export function parseWhisperJson(raw: string): ParsedTranscriptSegment[] {
  const parsed = JSON.parse(raw) as { transcription?: Array<{ text?: string; timestamps?: { from?: unknown; to?: unknown }; offsets?: { from?: unknown; to?: unknown }; language?: string }>; segments?: Array<{ text?: string; start?: unknown; end?: unknown; language?: string }> };
  const rows = parsed.transcription ?? parsed.segments ?? [];
  return rows.map((row) => {
    const timestamps = 'timestamps' in row && row.timestamps ? row.timestamps : null;
    const offsets = 'offsets' in row && row.offsets ? row.offsets : null;
    const startMs = timestamps ? parseTimestamp(timestamps.from) : offsets ? parseTimestamp(offsets.from, 'milliseconds') : parseTimestamp((row as { start?: unknown }).start);
    const endMs = timestamps ? parseTimestamp(timestamps.to) : offsets ? parseTimestamp(offsets.to, 'milliseconds') : parseTimestamp((row as { end?: unknown }).end);
    return { text: String(row.text ?? '').trim(), startMs, endMs: Math.max(startMs, endMs), language: typeof row.language === 'string' ? row.language : null };
  }).filter((row) => row.text.length > 0);
}

export async function transcribeAudio(inputPath: string, outputPrefix: string, modelPath: string, whisperPath = process.env.KEEPTRAIL_WHISPER_PATH ?? 'whisper-cli', options: { signal?: AbortSignal } = {}): Promise<{ segments: ParsedTranscriptSegment[]; usedCpuFallback: boolean; durationMs: number }> {
  const args = ['-m', modelPath, '-f', inputPath, '-l', 'auto', '-t', '4', '-ojf', '-of', outputPrefix];
  let usedCpuFallback = false;
  try {
    await runCommand(whisperPath, args, { timeoutMs: 30 * 60_000, maxOutputBytes: 500_000, signal: options.signal });
  } catch (error) {
    if (!(error instanceof ToolExecutionError) || !/metal|gpu|ggml/i.test(error.message + error.stderr)) throw error;
    usedCpuFallback = true;
    await runCommand(whisperPath, [...args, '--no-gpu'], { timeoutMs: 30 * 60_000, maxOutputBytes: 500_000, signal: options.signal });
  }
  const output = await readFile(`${outputPrefix}.json`, 'utf8');
  const segments = parseWhisperJson(output);
  const durationMs = await wavDurationMs(inputPath);
  return { segments, usedCpuFallback, durationMs };
}

async function wavDurationMs(inputPath: string): Promise<number> {
  const wav = await readFile(inputPath);
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new ToolExecutionError('TOOL_FAILED', 'The normalized audio output is not a PCM WAV file.');
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  const bitsPerSample = wav.readUInt16LE(34);
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const chunkSize = wav.readUInt32LE(offset + 4);
    if (wav.toString('ascii', offset, offset + 4) === 'data') { dataBytes = chunkSize; break; }
    offset += 8 + chunkSize + (chunkSize % 2);
  }
  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  return bytesPerSecond > 0 ? Math.round((dataBytes / bytesPerSecond) * 1000) : 0;
}

export async function transcribeAudioChunks(inputPath: string, outputPrefix: string, modelPath: string, whisperPath = process.env.KEEPTRAIL_WHISPER_PATH ?? 'whisper-cli', ffmpegPath = process.env.KEEPTRAIL_FFMPEG_PATH ?? 'ffmpeg', options: { signal?: AbortSignal } = {}): Promise<{ segments: ParsedTranscriptSegment[]; usedCpuFallback: boolean; durationMs: number; chunksCompleted: number }> {
  const durationMs = await wavDurationMs(inputPath);
  if (durationMs <= 60_000) {
    const result = await transcribeAudio(inputPath, outputPrefix, modelPath, whisperPath, options);
    return { ...result, chunksCompleted: 1 };
  }
  const all: ParsedTranscriptSegment[] = [];
  let usedCpuFallback = false;
  let chunksCompleted = 0;
  for (let startMs = 0; startMs < durationMs; startMs += 60_000) {
    const chunkPath = `${outputPrefix}.chunk-${String(startMs).padStart(8, '0')}.wav`;
    const chunkPrefix = `${outputPrefix}.chunk-${String(startMs).padStart(8, '0')}`;
    await runCommand(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', String(startMs / 1000), '-t', String(Math.min(61_000, durationMs - startMs) / 1000), '-i', inputPath, '-ac', '1', '-ar', '16000', '-sample_fmt', 's16', '-f', 'wav', '-y', chunkPath], { timeoutMs: 5 * 60_000, maxOutputBytes: 100_000, signal: options.signal });
    try {
      const result = await transcribeAudio(chunkPath, chunkPrefix, modelPath, whisperPath, options);
      usedCpuFallback ||= result.usedCpuFallback;
      for (const segment of result.segments) {
        const adjusted = { ...segment, startMs: Math.min(durationMs, segment.startMs + startMs), endMs: Math.min(durationMs, segment.endMs + startMs) };
        const overlap = all.find((previous) => previous.text === adjusted.text && Math.abs(previous.startMs - adjusted.startMs) <= 1_000);
        if (!overlap) all.push(adjusted);
      }
      chunksCompleted += 1;
    } finally {
      await rm(chunkPath, { force: true }).catch(() => undefined);
      await rm(`${chunkPrefix}.json`, { force: true }).catch(() => undefined);
    }
  }
  return { segments: all.sort((a, b) => a.startMs - b.startMs), usedCpuFallback, durationMs, chunksCompleted };
}

export function fileSha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}
