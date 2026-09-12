import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, getItemDetail, importUrl, listLibrary, openDatabase } from '../packages/core/src/index';

const tempDirectories: string[] = [];

afterEach(() => {
  while (tempDirectories.length) {
    const directory = tempDirectories.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe('library persistence', () => {
  it('creates a resumable queued job and deduplicates by canonical URL', () => {
    const directory = mkdtempSync(join(tmpdir(), 'keeptrail-test-'));
    tempDirectories.push(directory);
    const db = openDatabase(directory);
    const first = importUrl(db, 'https://example.com/notes?utm_source=test');
    const second = importUrl(db, 'https://example.com/notes');
    const library = listLibrary(db, {});
    const detail = getItemDetail(db, first.id);
    closeDatabase(db);

    expect(first.kind).toBe('created');
    expect(second).toMatchObject({ kind: 'existing', id: first.id });
    expect(library.total).toBe(1);
    expect(library.items[0]).toMatchObject({ status: 'queued', platform: 'web' });
    expect(detail).toMatchObject({ id: first.id, evidence: [], transcript: [] });
  });
});
