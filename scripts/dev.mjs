import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

if (!existsSync('apps/server/dist/index.js')) process.stderr.write('Build artifacts are missing. Run npm run build first.\n');
const children = [
  spawn('node', ['apps/server/dist/index.js'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } }),
  spawn('node', ['apps/worker/dist/index.js'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } }),
  spawn('npm', ['-w', 'apps/web', 'run', 'dev'], { stdio: 'inherit', env: process.env })
];
function stop() { children.forEach((child) => child.kill('SIGTERM')); }
process.on('SIGINT', stop); process.on('SIGTERM', stop);
