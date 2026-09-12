import { existsSync, accessSync, constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { getDataDirectory, openDatabase, closeDatabase } from '../packages/core/dist/index.js';

let failed = false;
function check(label, pass, detail) { process.stdout.write(`${pass ? 'PASS' : 'FAIL'} ${label}: ${detail}\n`); if (!pass) failed = true; }
check('Node', process.version === 'v22.23.2', `${process.version} detected`);
const dataDirectory = getDataDirectory();
check('Data directory', existsSync(dataDirectory), dataDirectory);
try { accessSync(dataDirectory, constants.W_OK); check('Data writable', true, 'yes'); } catch { check('Data writable', false, 'no'); }
try { const db = openDatabase(dataDirectory); check('SQLite migrations', true, 'applied'); closeDatabase(db); } catch (error) { check('SQLite migrations', false, String(error)); }
for (const command of ['ffmpeg', 'ffprobe', 'python3']) { try { const value = execFileSync('which', [command], { encoding: 'utf8' }).trim(); check(command, true, value); } catch { check(command, false, 'not found'); } }
check('Gemini key', true, 'optional, not configured state is valid');
process.exitCode = failed ? 1 : 0;
