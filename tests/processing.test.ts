import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase, importUrl, claimNextJob, processJob, getItemDetail, itemDiagnostics, retryItem, updateItem, listLibrary, type KeeptrailDb } from '../packages/core/src/index';
import { parseWhisperJson } from '../packages/core/src/media';

let db: KeeptrailDb;
let directory: string;
beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'keeptrail-processing-')); db = openDatabase(directory); });
afterEach(() => { db.close(); rmSync(directory, { recursive: true, force: true }); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('honest processing and diagnostics', () => {
  it('parses Whisper.cpp v1.9.4 comma-decimal timestamps without losing precision', () => {
    expect(parseWhisperJson(JSON.stringify({ transcription: [{ text: 'bonjour', timestamps: { from: '00:00:01,250', to: '00:00:02,500' }, language: 'fr' }] }))).toEqual([{ text: 'bonjour', startMs: 1_250, endMs: 2_500, language: 'fr' }]);
    expect(parseWhisperJson(JSON.stringify({ transcription: [{ text: 'hello', offsets: { from: 3_000, to: 4_250 } }] }))).toEqual([{ text: 'hello', startMs: 3_000, endMs: 4_250, language: null }]);
  });

  it('never marks an Instagram HTML shell as an analyzed video', async () => {
    vi.stubEnv('KEEPTRAIL_YTDLP_PATH', join(directory, 'missing-ytdlp'));
    const source = importUrl(db, 'https://www.instagram.com/p/test-video/');
    const job = claimNextJob(db, 'test')!;
    expect(await processJob(db, job)).toMatchObject({ status: 'failed', code: 'YTDLP_MISSING' });
    expect(getItemDetail(db, source.id)).toMatchObject({ status: 'needs_review', evidence: [], transcript: [] });
    expect(itemDiagnostics(db, source.id)).toMatchObject({ errorCode: 'YTDLP_MISSING', jobs: [{ status: 'blocked' }] });
    expect(listLibrary(db).processingCount).toBe(0);
  });
  it('rejects empty HTML as a successful import', async () => {
    const source = importUrl(db, 'https://example.com/empty');
    await processJob(db, claimNextJob(db, 'test')!, undefined, undefined, { fetchPage: async () => ({ url: 'https://example.com/empty', response: { statusCode: 200, headers: { 'content-type': 'text/html' }, body: Buffer.from('<html><body></body></html>') } }) });
    expect(itemDiagnostics(db, source.id)).toMatchObject({ status: 'needs_review', errorCode: 'EMPTY_PAGE', counts: { analyses: 0 } });
  });
  it('preserves notes on retry, prevents duplicate work, and excludes source content and secrets', async () => {
    const source = importUrl(db, 'https://www.instagram.com/p/private-test/');
    updateItem(db, source.id, { note: 'PRIVATE_NOTE', tags: ['private-tag'] });
    await processJob(db, claimNextJob(db, 'test')!);
    db.prepare("UPDATE jobs SET error_message='SECRET_TOKEN' WHERE item_id=?").run(source.id);
    const report = JSON.stringify(itemDiagnostics(db, source.id));
    for (const secret of ['PRIVATE_NOTE', 'SECRET_TOKEN', 'private-test', 'private-tag']) expect(report).not.toContain(secret);
    expect(retryItem(db, source.id).status).toBe('queued');
    expect(retryItem(db, source.id).status).toBe('busy');
    expect(getItemDetail(db, source.id)?.note).toBe('PRIVATE_NOTE');
  });
  it('reports unavailable analysis even when a key is configured', async () => {
    const source = importUrl(db, 'https://example.com/source');
    db.prepare("INSERT INTO settings VALUES ('groq_key_configured','1',?)").run(new Date().toISOString());
    db.prepare("UPDATE jobs SET stage='analyze' WHERE item_id=?").run(source.id);
    await processJob(db, claimNextJob(db, 'test')!);
    expect(itemDiagnostics(db, source.id)?.errorCode).toBe('WAITING_FOR_KEY');
  });
});
