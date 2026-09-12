import { createHash } from 'node:crypto';
import { createReadStream, mkdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import sanitizeHtml from 'sanitize-html';
import type { KeeptrailDb } from './db.js';
import { getDataDirectory } from './db.js';
import { newId } from './normalize.js';

export type WorkerResult = { status: 'completed' | 'waiting' | 'failed'; message?: string };

export function claimNextJob(db: KeeptrailDb, workerId: string, now = new Date()): { id: string; itemId: string; stage: string } | null {
  const nowIso = now.toISOString();
  const leaseExpiry = new Date(now.getTime() + 60_000).toISOString();
  const tx = db.transaction(() => {
    const row = db.prepare(`SELECT j.id,j.item_id,j.stage FROM jobs j JOIN items i ON i.id=j.item_id WHERE j.status='queued' AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=?) AND i.status NOT IN ('paused','canceled') ORDER BY j.created_at LIMIT 1`).get(nowIso) as { id: string; item_id: string; stage: string } | undefined;
    if (!row) return null;
    const claimed = db.prepare(`UPDATE jobs SET status='running', lease_owner=?, lease_expires_at=?, attempt_count=attempt_count+1, updated_at=? WHERE id=? AND status='queued'`).run(workerId, leaseExpiry, nowIso, row.id);
    if (!claimed.changes) return null;
    db.prepare('UPDATE items SET status=? WHERE id=?').run(row.stage === 'acquire' ? 'downloading' : 'analyzing', row.item_id);
    return { id: row.id, itemId: row.item_id, stage: row.stage };
  });
  return tx() as { id: string; itemId: string; stage: string } | null;
}

export function completeJob(db: KeeptrailDb, jobId: string, itemId: string, status: 'ready' | 'needs_review' | 'waiting_for_key' | 'failed', message?: string): void {
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare(`UPDATE jobs SET status='done', lease_owner=NULL, lease_expires_at=NULL, error_message=?, updated_at=? WHERE id=?`).run(message ?? null, now, jobId);
    db.prepare('UPDATE items SET status=?, error_message=? WHERE id=?').run(status, message ?? null, itemId);
  });
  tx();
}

export async function processJob(db: KeeptrailDb, job: { id: string; itemId: string; stage: string }, dataDirectory = getDataDirectory()): Promise<WorkerResult> {
  const item = db.prepare('SELECT id,type,platform,source_url,title,description FROM items WHERE id=?').get(job.itemId) as { id: string; type: string; platform: string; source_url: string | null; title: string; description: string } | undefined;
  if (!item) return { status: 'failed', message: 'Source item no longer exists.' };
  if (job.stage !== 'acquire') {
    completeJob(db, job.id, item.id, 'waiting_for_key', 'Cloud analysis is waiting for the selected provider key in Settings.');
    return { status: 'waiting', message: 'Cloud analysis is waiting for the selected provider key in Settings.' };
  }
  if (!item.source_url) {
    completeJob(db, job.id, item.id, 'ready');
    return { status: 'completed' };
  }
  try {
    const response = await fetch(item.source_url, { redirect: 'manual', signal: AbortSignal.timeout(20_000), headers: { accept: 'text/html,application/xhtml+xml' } });
    if (!response.ok || response.status >= 300) {
      completeJob(db, job.id, item.id, 'needs_review', 'The source needs local-file fallback or a browser session before it can be downloaded.');
      return { status: 'waiting', message: 'The source needs local-file fallback or a browser session before it can be downloaded.' };
    }
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > 5 * 1024 * 1024) {
      completeJob(db, job.id, item.id, 'needs_review', 'This page is larger than the 5 MiB HTML limit.');
      return { status: 'failed', message: 'This page is larger than the 5 MiB HTML limit.' };
    }
    const html = (await response.text()).slice(0, 5 * 1024 * 1024);
    const dom = new JSDOM(html, { url: item.source_url });
    const article = new Readability(dom.window.document).parse();
    const text = sanitizeHtml(article?.textContent ?? '', { allowedTags: [], allowedAttributes: {} }).replace(/\s+/g, ' ').trim().slice(0, 60000);
    const title = (article?.title ?? item.title ?? new URL(item.source_url).hostname).slice(0, 160);
    const description = text.slice(0, 600);
    const evidenceId = `page:${newId()}`;
    const now = new Date().toISOString();
    const chunkId = newId();
    db.transaction(() => {
      db.prepare('UPDATE items SET title=?, description=?, status=? WHERE id=?').run(title, description, 'ready', item.id);
      db.prepare('INSERT OR REPLACE INTO evidence (id,item_id,revision,kind,label,excerpt) VALUES (?,?,?,?,?,?)').run(evidenceId, item.id, 1, 'page', 'Readable page text', description);
      db.prepare('INSERT OR REPLACE INTO analysis_revisions (id,item_id,revision,title,summary,key_points_json,topics_json,image_descriptors_json,model_id,prompt_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(newId(), item.id, 1, title, description, JSON.stringify([{ text: description, evidenceIds: [evidenceId] }]), JSON.stringify(['other']), JSON.stringify({ subject: [], style: [], layout: [] }), 'local-readability', 'page-v1', now);
      db.prepare('INSERT INTO search_chunks (id,item_id,source_kind,source_id,body,evidence_ids_json) VALUES (?,?,?,?,?,?)').run(chunkId, item.id, 'page', evidenceId, `${title}\n${text}`, JSON.stringify([evidenceId]));
      db.prepare('INSERT OR IGNORE INTO item_topics (item_id,topic_slug) VALUES (?,?)').run(item.id, 'other');
      db.prepare(`UPDATE jobs SET status='done', lease_owner=NULL, lease_expires_at=NULL, updated_at=? WHERE id=?`).run(now, job.id);
    })();
    void dataDirectory;
    return { status: 'completed' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The source could not be fetched.';
    completeJob(db, job.id, item.id, 'needs_review', `Download failed: ${message.slice(0, 180)}`);
    return { status: 'failed', message };
  }
}

export function registerLocalAsset(db: KeeptrailDb, itemId: string, sourcePath: string, mime: string, dataDirectory = getDataDirectory()): string {
  const id = newId();
  const relativePath = join('originals', `${id}-${basename(sourcePath)}`);
  mkdirSync(join(dataDirectory, 'originals'), { recursive: true, mode: 0o700 });
  const bytes = statSync(sourcePath).size;
  const sha256 = createHash('sha256');
  createReadStream(sourcePath).on('data', (chunk: string | Buffer) => sha256.update(chunk));
  db.prepare('INSERT INTO assets (id,item_id,role,relative_path,mime,bytes,sha256,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, itemId, 'original', relativePath, mime, bytes, 'pending', new Date().toISOString());
  return id;
}
