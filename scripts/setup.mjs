import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { getDataDirectory, openDatabase, closeDatabase } from '../packages/core/dist/index.js';

const expected = '22.23.2';
if (process.version !== `v${expected}`) process.stderr.write(`Keeptrail setup: Node ${expected} is required; detected ${process.version}.\n`);
const dataDirectory = getDataDirectory();
await mkdir(dataDirectory, { recursive: true, mode: 0o700 });
const db = openDatabase(dataDirectory);
closeDatabase(db);
for (const command of ['ffmpeg', 'ffprobe', 'python3']) {
  try { execFileSync('which', [command], { stdio: 'ignore' }); } catch { process.stderr.write(`Optional dependency not found: ${command}. See docs/DEPENDENCIES.md.\n`); }
}
process.stdout.write(`Keeptrail data directory ready at ${dataDirectory}\n`);
