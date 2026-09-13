import type { KeeptrailDb } from './db.js';
import { newId } from './normalize.js';

export const capabilities = {
  readableWebPages: 'implemented', socialDownload: 'available',
  transcription: 'available', cloudAnalysis: 'available', browserSessionImport: 'blocked'
} as const;

const explanations: Record<string, string> = {
  YTDLP_MISSING: 'The individual social-video acquisition path is implemented, but the pinned yt-dlp tool is not installed locally.',
  TOOL_MISSING: 'A required local media tool is missing. Run the setup and doctor commands, then retry.',
  WAITING_FOR_KEY: 'Local processing is available. Cloud analysis is waiting for a tested selected provider key and managed gateway.',
  NETWORK_DNS_BLOCKED: 'The source DNS answers included a private or reserved address, so the network policy rejected it.',
  EMPTY_PAGE: 'The page returned no readable text. JavaScript or authentication may be required.',
  LEGACY_FALSE_SUCCESS: 'An earlier build marked this video Ready after reading its HTML page. No video processing took place.'
};

export function itemDiagnostics(db: KeeptrailDb, id: string) {
  const item = db.prepare('SELECT id,type,platform,status,error_code,current_revision FROM items WHERE id=?').get(id) as { id: string; type: string; platform: string; status: string; error_code: string | null; current_revision: number } | undefined;
  if (!item) return null;
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE item_id=?`).get(id) as { count: number }).count;
  const legacy = item.platform !== 'web' && item.platform !== 'local' && item.status === 'ready' && Boolean(db.prepare("SELECT 1 FROM analysis_revisions WHERE item_id=? AND model_id='local-readability'").get(id));
  const code = legacy ? 'LEGACY_FALSE_SUCCESS' : item.error_code;
  const jobs = db.prepare('SELECT id,stage,status,attempt_count,created_at,updated_at,next_attempt_at,lease_expires_at,error_category,checkpoint_json FROM jobs WHERE item_id=? ORDER BY created_at DESC,rowid DESC LIMIT 20').all(id) as Array<Record<string, unknown>>;
  const safeJobs: Array<Record<string, unknown>> = jobs.map(({ checkpoint_json, ...job }) => {
    const checkpoint: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(checkpoint_json ?? '{}')) as Record<string, unknown>;
      for (const key of ['frameIndex', 'previousCaptureId', 'chunksCompleted', 'candidateCount', 'analyzedCount']) {
        if (parsed[key] !== undefined) checkpoint[key] = parsed[key];
      }
    } catch { /* malformed checkpoints are not diagnostic payloads */ }
    return { ...job, checkpoint } as Record<string, unknown>;
  });
  const plan = db.prepare("SELECT output_json FROM stage_results WHERE item_id=? AND stage='plan_frames' ORDER BY created_at DESC LIMIT 1").get(id) as { output_json: string } | undefined;
  let coverage: { sampled: number | null; analyzed: number | null } = { sampled: null, analyzed: null };
  try {
    const output = JSON.parse(plan?.output_json ?? '{}') as { candidateCount?: number; analyzedCount?: number };
    coverage = { sampled: Number.isFinite(output.candidateCount) ? Number(output.candidateCount) : null, analyzed: Number.isFinite(output.analyzedCount) ? Number(output.analyzedCount) : null };
  } catch { /* no plan yet */ }
  const quotaCap = Math.max(1, Math.min(30, Number((db.prepare("SELECT value FROM settings WHERE key='daily_cloud_cap'").get() as { value: string } | undefined)?.value ?? 30) || 30));
  const quotaUsed = (db.prepare("SELECT COUNT(*) AS count FROM inference_calls WHERE substr(created_at,1,10)=substr(?,1,10)").get(new Date().toISOString()) as { count: number }).count;
  const latestJob = safeJobs[0];
  return {
    schemaVersion: 1, itemId: id, platform: item.platform, status: item.status,
    errorCode: code, explanation: code ? explanations[code] ?? 'Processing stopped. Inspect the stage and retry after resolving its prerequisites.' : null,
    currentRevision: item.current_revision,
    currentStage: typeof latestJob?.stage === 'string' ? latestJob.stage : null,
    jobs: safeJobs,
    coverage,
    estimatedCloudRequests: coverage.analyzed === null ? null : Math.ceil(coverage.analyzed / 5) + 1,
    quota: { cap: quotaCap, used: quotaUsed, remaining: Math.max(0, quotaCap - quotaUsed) },
    counts: { assets: count('assets'), transcripts: count('transcript_segments'), evidence: count('evidence'), analyses: count('analysis_revisions') },
    retryable: !['queued', 'downloading', 'transcribing', 'analyzing', 'indexing'].includes(item.status),
    privacy: 'Contains IDs, processing states and counts only. Excludes keys, cookies, URLs, titles, notes, transcripts, paths and raw error messages.'
  };
}

export function retryItem(db: KeeptrailDb, id: string): { status: 'queued' | 'busy' | 'missing'; jobId?: string } {
  return db.transaction(() => {
    const item = db.prepare('SELECT type,source_url FROM items WHERE id=?').get(id) as { type: string; source_url: string | null } | undefined;
    if (!item) return { status: 'missing' as const };
    if (db.prepare("SELECT 1 FROM jobs WHERE item_id=? AND status IN ('queued','running')").get(id)) return { status: 'busy' as const };
    const jobId = newId();
    const now = new Date().toISOString();
    const stage = 'acquire';
    db.prepare("INSERT INTO jobs (id,item_id,stage,status,created_at,updated_at) VALUES (?,?,?,'queued',?,?)").run(jobId, id, stage, now, now);
    db.prepare("UPDATE items SET status='queued',error_code=NULL,error_message=NULL WHERE id=?").run(id);
    return { status: 'queued' as const, jobId };
  })();
}
