import { createHash } from 'node:crypto';
import type { KeeptrailDb } from './db.js';
import { newId } from './normalize.js';

export const DEFAULT_DAILY_CLOUD_CAP = 30;
export const MIN_REQUEST_SPACING_MS = 60_000;

export type Reservation = { allowed: true; id: string; remaining: number } | { allowed: false; reason: 'daily_cap' | 'spacing'; retryAt: string; remaining: number };
export type HealthReservation = { allowed: true; ids: [string, string]; remaining: number } | { allowed: false; reason: 'daily_cap'; retryAt: string; remaining: number };

function utcDay(date: Date): string { return date.toISOString().slice(0, 10); }

function setting(db: KeeptrailDb, key: string, fallback: string): string {
  return (db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined)?.value ?? fallback;
}

export function reserveInference(db: KeeptrailDb, input: { itemId?: string; kind: string; provider: string; requestedModel: string; input: string; estimatedTokens: number; now?: Date }): Reservation {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const day = utcDay(now);
  const cap = Math.max(1, Math.min(30, Number(setting(db, 'daily_cloud_cap', String(DEFAULT_DAILY_CLOUD_CAP))) || DEFAULT_DAILY_CLOUD_CAP));
  return db.transaction(() => {
    const used = (db.prepare("SELECT COUNT(*) AS count FROM inference_calls WHERE substr(created_at,1,10)=?").get(day) as { count: number }).count;
    const remaining = Math.max(0, cap - used);
    if (used >= cap) return { allowed: false as const, reason: 'daily_cap' as const, retryAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString(), remaining };
    const last = db.prepare('SELECT created_at FROM inference_calls ORDER BY created_at DESC LIMIT 1').get() as { created_at: string } | undefined;
    const lastAt = last ? Date.parse(last.created_at) : Number.NEGATIVE_INFINITY;
    if (Number.isFinite(lastAt) && now.getTime() - lastAt < MIN_REQUEST_SPACING_MS) return { allowed: false as const, reason: 'spacing' as const, retryAt: new Date(lastAt + MIN_REQUEST_SPACING_MS).toISOString(), remaining };
    const id = newId();
    db.prepare('INSERT INTO inference_calls (id,item_id,kind,provider,requested_model,input_hash,status,estimated_tokens,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, input.itemId ?? null, input.kind, input.provider, input.requestedModel, createHash('sha256').update(input.input).digest('hex'), 'reserved', Math.max(0, Math.floor(input.estimatedTokens)), nowIso);
    return { allowed: true as const, id, remaining: remaining - 1 };
  })();
}

/**
 * The settings probe is an explicit two-request user action. Reserve both
 * daily slots atomically so a partially completed text/vision probe cannot
 * overrun the cap. The normal inference path still enforces 60s spacing.
 */
export function reserveHealthChecks(db: KeeptrailDb, input: { provider: string; requestedModel: string; now?: Date }): HealthReservation {
  const now = input.now ?? new Date();
  const day = utcDay(now);
  const cap = Math.max(1, Math.min(30, Number(setting(db, 'daily_cloud_cap', String(DEFAULT_DAILY_CLOUD_CAP))) || DEFAULT_DAILY_CLOUD_CAP));
  return db.transaction(() => {
    const used = (db.prepare("SELECT COUNT(*) AS count FROM inference_calls WHERE substr(created_at,1,10)=?").get(day) as { count: number }).count;
    const remaining = Math.max(0, cap - used);
    if (remaining < 2) return { allowed: false as const, reason: 'daily_cap' as const, retryAt: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString(), remaining };
    const ids = [newId(), newId()] as [string, string];
    const insert = db.prepare('INSERT INTO inference_calls (id,item_id,kind,provider,requested_model,input_hash,status,estimated_tokens,created_at) VALUES (?,?,?,?,?,?,?,?,?)');
    for (const [index, id] of ids.entries()) insert.run(id, null, index === 0 ? 'health_text' : 'health_vision', input.provider, input.requestedModel, createHash('sha256').update(`health:${index}:${now.toISOString()}`).digest('hex'), 'reserved', index === 0 ? 32 : 128, now.toISOString());
    return { allowed: true as const, ids, remaining: remaining - 2 };
  })();
}

export function markInferenceStarted(db: KeeptrailDb, id: string, now = new Date()): void {
  db.prepare("UPDATE inference_calls SET status='running', started_at=? WHERE id=? AND status='reserved'").run(now.toISOString(), id);
}

export function finishInference(db: KeeptrailDb, id: string, input: { status: 'success' | 'failed' | 'unknown'; returnedModel?: string; actualTokens?: number; retryAfterAt?: string | null; now?: Date }): void {
  const status = input.status;
  db.prepare('UPDATE inference_calls SET status=?, returned_model=?, actual_tokens=?, retry_after_at=?, outcome_unknown=?, completed_at=? WHERE id=?').run(status, input.returnedModel ?? null, input.actualTokens ?? null, input.retryAfterAt ?? null, status === 'unknown' ? 1 : 0, (input.now ?? new Date()).toISOString(), id);
}

export function retryDelayMs(attempt: number, status: number, retryAfterHeader?: string | null, now = new Date()): number | null {
  if (status === 429) {
    if (retryAfterHeader) {
      const seconds = Number(retryAfterHeader);
      if (Number.isFinite(seconds) && seconds >= 0) return Math.min(24 * 60 * 60_000, seconds * 1000);
      const date = Date.parse(retryAfterHeader);
      if (Number.isFinite(date)) return Math.min(24 * 60 * 60_000, Math.max(0, date - now.getTime()));
    }
    return attempt <= 1 ? 15 * 60_000 : 60 * 60_000;
  }
  if (status === 401 || status === 403 || status === 404) return null;
  if (status >= 500 || status === 0) {
    if (attempt < 1 || attempt > 3) return null;
    return [30_000, 120_000, 600_000][attempt - 1] ?? null;
  }
  return null;
}
