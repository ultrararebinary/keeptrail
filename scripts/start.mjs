import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('apps/server/dist/index.js') || !existsSync('apps/web/dist/index.html')) { process.stderr.write('Production build missing. Run npm run build first.\n'); process.exit(1); }
const children = [
  spawn('node', ['apps/server/dist/index.js'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } }),
  spawn('node', ['apps/worker/dist/index.js'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } })
];
let opened = false;
const health = setInterval(async () => { try { const response = await fetch('http://127.0.0.1:4317/api/health'); if (response.ok && !opened) { opened = true; clearInterval(health); const opener = process.platform === 'darwin' ? 'open' : 'xdg-open'; spawn(opener, ['http://127.0.0.1:4317'], { stdio: 'ignore', detached: true }).unref(); } } catch { /* server is still starting */ } }, 250);
function stop() { clearInterval(health); children.forEach((child) => child.kill('SIGTERM')); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
