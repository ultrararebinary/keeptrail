import { createHash } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { constants, createReadStream } from 'node:fs';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { createConnection } from 'node:net';

const execFile = promisify(execFileCallback);
const repo = resolve(new URL('..', import.meta.url).pathname);
const tools = join(repo, '.tools');
const expectedNode = 'v22.23.2';
let failed = false;
function check(label, pass, detail) { process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${label}: ${detail}\n`); if (!pass) failed = true; }
function comparableVersion(value) { return String(value).split('.').map((part) => String(Number(part))).join('.'); }
async function command(file, args) { try { const result = await execFile(file, args, { cwd: repo, maxBuffer: 2 * 1024 * 1024 }); return result.stdout.trim(); } catch { return null; } }
async function digest(path) { const hash = createHash('sha256'); let bytes = 0; await new Promise((resolvePromise, reject) => { const stream = createReadStream(path); stream.on('data', (chunk) => { bytes += chunk.length; hash.update(chunk); }); stream.on('end', resolvePromise); stream.on('error', reject); }); return { bytes, sha256: hash.digest('hex') }; }
async function fileCheck(label, path, expected = {}) { try { await access(path, constants.R_OK); const info = await stat(path); const actual = expected.sha256 ? await digest(path) : { bytes: info.size }; const pass = info.isFile() && (!expected.bytes || actual.bytes === expected.bytes) && (!expected.sha256 || actual.sha256 === expected.sha256); check(label, pass, pass ? path : `${path} (${JSON.stringify(actual)})`); return pass; } catch { check(label, false, `${path} is missing or unreadable`); return false; } }
async function portStatus(port) { return new Promise((resolvePromise) => { const socket = createConnection({ host: '127.0.0.1', port }); socket.once('connect', () => { socket.destroy(); resolvePromise('occupied'); }); socket.once('error', () => resolvePromise('free')); socket.setTimeout(700, () => { socket.destroy(); resolvePromise('free'); }); }); }

const lockPath = join(tools, 'tools.lock.json');
let lock = null;
try { lock = JSON.parse(await readFile(lockPath, 'utf8')); check('Tools lock', true, lockPath); } catch { check('Tools lock', false, `Run npm run setup to create ${lockPath}`); }
check('Node', process.version === expectedNode, `${process.version} detected; required ${expectedNode}`);
const python = process.env.KEEPTRAIL_PYTHON ?? 'python3';
const pythonVersion = await command(python, ['--version']);
check('Python', Boolean(pythonVersion && /^Python 3\.12\./.test(pythonVersion)), pythonVersion ?? `${python} not found`);
const dataDirectory = process.env.KEEPTRAIL_DATA_DIR ?? join(process.env.HOME ?? repo, 'Library', 'Application Support', 'Keeptrail');
try { await access(dataDirectory, constants.W_OK); check('Data directory', true, `${dataDirectory} writable`); } catch { check('Data directory', false, `${dataDirectory} is not writable`); }
try { const core = await import('../packages/core/dist/index.js'); const db = core.openDatabase(dataDirectory); check('SQLite migrations', true, 'applied'); core.closeDatabase(db); } catch (error) { check('SQLite migrations', false, error instanceof Error ? error.message : String(error)); }

const ytdlpPath = join(tools, 'venv', 'bin', 'yt-dlp');
const ytdlpVersion = await command(ytdlpPath, ['--version']);
check('yt-dlp', ytdlpVersion !== null && comparableVersion(ytdlpVersion) === comparableVersion('2026.8.19'), `${ytdlpVersion ?? 'missing'} detected; required 2026.8.19`);
let ffmpegPrefix = null;
const brewPrefix = await command('brew', ['--prefix', 'ffmpeg']);
if (brewPrefix) ffmpegPrefix = brewPrefix;
const ffmpegPath = ffmpegPrefix ? join(ffmpegPrefix, 'bin', 'ffmpeg') : join(tools, 'ffmpeg', 'bin', 'ffmpeg');
const ffprobePath = ffmpegPrefix ? join(ffmpegPrefix, 'bin', 'ffprobe') : join(tools, 'ffmpeg', 'bin', 'ffprobe');
await fileCheck('Homebrew ffmpeg', ffmpegPath); await fileCheck('Homebrew ffprobe', ffprobePath);
check('FFmpeg version', Boolean(await command(ffmpegPath, ['-version'])), (await command(ffmpegPath, ['-version']))?.split('\n')[0] ?? 'unavailable');

const whisperPath = lock?.whisper?.executable ?? join(tools, 'whisper.cpp', 'build', 'bin', 'whisper-cli');
await fileCheck('whisper-cli', whisperPath);
const modelSpecs = lock?.models ?? [];
for (const model of modelSpecs) await fileCheck(`Whisper model ${model.name}`, model.path, { bytes: model.bytes, sha256: model.sha256 });
const omniPath = lock?.omniRoute?.executable ?? join(tools, 'omniroute', 'node_modules', '.bin', 'omniroute');
await fileCheck('OmniRoute binary', omniPath);
check('OmniRoute package', lock?.omniRoute?.version === '3.8.50', lock?.omniRoute?.version ?? 'not recorded');
const existingPort = await portStatus(20128); const managedPort = await portStatus(20129);
check('Port 20128', true, existingPort);
check('Managed port 20129', managedPort === 'free', managedPort);
process.exitCode = failed ? 1 : 0;
