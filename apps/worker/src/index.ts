import { randomUUID } from 'node:crypto';
import { closeDatabase, getDataDirectory, openDatabase, claimNextJob, processJob, renewLease } from '@keeptrail/core';

const dataDirectory = getDataDirectory();
const db = openDatabase(dataDirectory);
const workerId = `worker-${randomUUID()}`;
let stopping = false;
let busy = false;

async function tick(): Promise<void> {
  if (stopping || busy) return;
  busy = true;
  try {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at').run('worker_heartbeat', now, now);
    const job = claimNextJob(db, workerId);
    if (job) {
      process.stdout.write(`${JSON.stringify({ event: 'job.started', jobId: job.id, itemId: job.itemId, stage: job.stage, at: now })}\n`);
      const heartbeat = setInterval(() => { renewLease(db, job.id, workerId); }, 10_000);
      try {
        const result = await processJob(db, job, dataDirectory);
        process.stdout.write(`${JSON.stringify({ event: 'job.finished', jobId: job.id, itemId: job.itemId, stage: job.stage, status: result.status, code: result.code, at: new Date().toISOString() })}\n`);
      } finally {
        clearInterval(heartbeat);
      }
    }
  } finally {
    busy = false;
    if (stopping) closeDatabase(db);
  }
}

const timer = setInterval(() => { void tick().catch((error) => process.stderr.write(`Keeptrail worker error: ${String(error)}\n`)); }, 1000);
void tick();

function stop(): void {
  stopping = true;
  clearInterval(timer);
  if (!busy) closeDatabase(db);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
