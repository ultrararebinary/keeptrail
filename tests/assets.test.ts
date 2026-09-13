import { createHash } from 'node:crypto';
import { chmod, readFile, stat, writeFile } from 'node:fs/promises';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { finalizeStreamedAsset, importUrl, openDatabase, reconcileFinalizedAssets, removeOwnedPartials, type KeeptrailDb } from '../packages/core/src/index';

let db: KeeptrailDb | undefined; let directory: string | undefined;
afterEach(() => { db?.close(); if (directory) rmSync(directory, { recursive: true, force: true }); db = undefined; directory = undefined; });
describe('owned asset lifecycle', () => {
  it('hashes and atomically registers a finalized asset', async () => {
    directory = mkdtempSync(join(tmpdir(), 'keeptrail-assets-')); db = openDatabase(directory); const item = importUrl(db, 'https://example.com/asset'); const source = join(directory, 'source.bin'); const content = Buffer.from('owned-asset'); await writeFile(source, content);
    const asset = await finalizeStreamedAsset(db, { itemId: item.id, sourcePath: source, mime: 'application/octet-stream', dataDirectory: directory });
    expect(asset.sha256).toBe(createHash('sha256').update(content).digest('hex')); expect((await stat(join(directory, asset.relativePath))).mode & 0o777).toBe(0o600); expect(await readFile(join(directory, asset.relativePath))).toEqual(content);
  });
  it('removes only registered-file orphans and owned partials', async () => {
    directory = mkdtempSync(join(tmpdir(), 'keeptrail-assets-')); db = openDatabase(directory); const orphan = join(directory, 'captures', '11111111-1111-4111-8111-111111111111-orphan.jpg'); await writeFile(orphan, 'orphan'); const partial = join(directory, 'tmp', 'job.partial'); await writeFile(partial, 'partial'); await chmod(partial, 0o600);
    expect(await reconcileFinalizedAssets(db, directory)).toBe(1); await removeOwnedPartials(directory); await expect(stat(orphan)).rejects.toThrow(); await expect(stat(partial)).rejects.toThrow();
  });
});
