import { randomUUID } from 'node:crypto';
import { closeDatabase, getDataDirectory, openDatabase, claimNextJob, processJob } from '@keeptrail/core';

const dataDirectory = getDataDirectory();
const db = openDatabase(dataDirectory);
const workerId = `worker-${randomUUID()}`;
let stopping = false;

async function tick(): Promise<void> {
  if (stopping) return;
  db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run('worker_heartbeat', new Date().toISOString(), new Date().toISOString());
  const job = claimNextJob(db, workerId);
  if (job) await processJob(db, job, dataDirectory);
}

const timer = setInterval(() => { void tick().catch((error) => process.stderr.write(`Keeptrail worker error: ${String(error)}\n`)); }, 1000);
void tick();

function stop(): void {
  stopping = true;
  clearInterval(timer);
  closeDatabase(db);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
