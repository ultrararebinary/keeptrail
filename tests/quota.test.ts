import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, reserveHealthChecks, reserveInference, retryDelayMs, type KeeptrailDb } from '../packages/core/src/index';

const databases: KeeptrailDb[] = []; const directories: string[] = [];
afterEach(() => { while (databases.length) databases.pop()?.close(); while (directories.length) { const directory = directories.pop(); if (directory) rmSync(directory, { recursive: true, force: true }); } });
function database(): KeeptrailDb { const directory = mkdtempSync(join(tmpdir(), 'keeptrail-quota-')); directories.push(directory); const db = openDatabase(directory); databases.push(db); return db; }

describe('durable cloud quota', () => {
  it('reserves health checks atomically and stops at the daily cap', () => {
    const db = database(); db.prepare("INSERT INTO settings VALUES ('daily_cloud_cap','2',?)").run(new Date().toISOString());
    expect(reserveHealthChecks(db, { provider: 'mistral', requestedModel: 'mistral/mistral-small-latest' })).toMatchObject({ allowed: true, remaining: 0 });
    expect(reserveHealthChecks(db, { provider: 'mistral', requestedModel: 'mistral/mistral-small-latest' })).toMatchObject({ allowed: false, reason: 'daily_cap' });
  });
  it('enforces global request spacing and bounded retry delays', () => {
    const db = database(); const first = new Date('2026-01-01T00:00:00.000Z');
    const base = { kind: 'test', provider: 'mistral', requestedModel: 'm', estimatedTokens: 1 };
    expect(reserveInference(db, { ...base, input: 'a', now: first }).allowed).toBe(true);
    expect(reserveInference(db, { ...base, input: 'b', now: new Date(first.getTime() + 59_999) })).toMatchObject({ allowed: false, reason: 'spacing' });
    expect(reserveInference(db, { ...base, input: 'c', now: new Date(first.getTime() + 60_000) }).allowed).toBe(true);
    expect(retryDelayMs(1, 429, '5')).toBe(5_000); expect(retryDelayMs(2, 503)).toBe(120_000); expect(retryDelayMs(4, 503)).toBeNull();
  });
});
