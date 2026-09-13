import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { chmod, mkdir, open, readdir, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { KeeptrailDb } from './db.js';

export const MAX_ORIGINAL_BYTES = 500 * 1024 * 1024;

function ownedPath(dataDirectory: string, relativePath: string): string {
  const root = resolve(dataDirectory);
  const target = resolve(dataDirectory, relativePath);
  if (!target.startsWith(`${root}/`)) throw new Error('Asset path escapes the Keeptrail data directory.');
  return target;
}

export function resolveOwnedAssetPath(dataDirectory: string, relativePath: string): string | null {
  try {
    return ownedPath(dataDirectory, relativePath);
  } catch {
    return null;
  }
}

type StreamedAsset = { bytes: number; sha256: string; path: string };

async function streamToPath(source: NodeJS.ReadableStream, path: string, maxBytes: number): Promise<StreamedAsset> {
  const temporaryPath = `${path}.partial`;
  const hash = createHash('sha256');
  let bytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(new Error(`Asset exceeds the ${maxBytes} byte limit.`));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    }
  });
  try {
    await pipeline(source, counter, createWriteStream(temporaryPath, { flags: 'wx', mode: 0o600 }));
    const handle = await open(temporaryPath, 'r+');
    await handle.sync();
    await handle.close();
    await chmod(temporaryPath, 0o600);
    await rename(temporaryPath, path);
    return { bytes, sha256: hash.digest('hex'), path };
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function commitStagedAsset(db: KeeptrailDb, input: { itemId: string; staged: StreamedAsset; filename: string; mime: string; role: string; timestampMs?: number | null; dataDirectory: string }): Promise<{ id: string; bytes: number; sha256: string; relativePath: string }> {
  const id = randomUUID();
  const originalName = input.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'asset';
  const role = input.role;
  const relativePath = join(role === 'capture' ? 'captures' : 'originals', `${id}-${originalName}`);
  const finalPath = ownedPath(input.dataDirectory, relativePath);
  await mkdir(dirname(finalPath), { recursive: true, mode: 0o700 });
  try {
    await rename(input.staged.path, finalPath);
    const createdAt = new Date().toISOString();
    db.prepare('INSERT INTO assets (id,item_id,role,relative_path,mime,bytes,timestamp_ms,sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, input.itemId, role, relativePath, input.mime, input.staged.bytes, input.timestampMs ?? null, input.staged.sha256, createdAt);
    return { id, bytes: input.staged.bytes, sha256: input.staged.sha256, relativePath };
  } catch (error) {
    await rm(input.staged.path, { force: true }).catch(() => undefined);
    await rm(finalPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function stageAssetStream(source: NodeJS.ReadableStream, dataDirectory: string, id = randomUUID(), maxBytes = MAX_ORIGINAL_BYTES): Promise<{ path: string; bytes: number; sha256: string }> {
  const path = ownedPath(dataDirectory, join('tmp', `${id}.upload`));
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  return streamToPath(source, path, maxBytes);
}

export async function commitStagedAssetFile(db: KeeptrailDb, input: { itemId: string; stagedPath: string; bytes: number; sha256: string; filename: string; mime: string; role?: string; timestampMs?: number | null; dataDirectory: string }): Promise<{ id: string; bytes: number; sha256: string; relativePath: string }> {
  return commitStagedAsset(db, { ...input, staged: { path: input.stagedPath, bytes: input.bytes, sha256: input.sha256 }, role: input.role ?? 'original' });
}

export async function finalizeStreamedAsset(db: KeeptrailDb, input: { itemId: string; sourcePath: string; mime: string; role?: string; timestampMs?: number | null; dataDirectory: string; maxBytes?: number }): Promise<{ id: string; bytes: number; sha256: string; relativePath: string }> {
  const filename = basename(input.sourcePath);
  const staged = await stageAssetStream(createReadStream(input.sourcePath), input.dataDirectory, randomUUID(), input.maxBytes ?? (input.role === 'capture' ? 1 * 1024 * 1024 : MAX_ORIGINAL_BYTES));
  return commitStagedAsset(db, { itemId: input.itemId, staged, filename, mime: input.mime, role: input.role ?? 'original', timestampMs: input.timestampMs, dataDirectory: input.dataDirectory });
}

export async function reconcileFinalizedAssets(db: KeeptrailDb, dataDirectory: string): Promise<number> {
  const rows = db.prepare('SELECT id,relative_path FROM assets').all() as Array<{ id: string; relative_path: string }>;
  const registered = new Set(rows.map((row) => resolveOwnedAssetPath(dataDirectory, row.relative_path)).filter((path): path is string => Boolean(path)));
  let removed = 0;
  for (const row of rows) {
    const path = resolveOwnedAssetPath(dataDirectory, row.relative_path);
    if (!path) {
      db.prepare('DELETE FROM assets WHERE id=?').run(row.id);
      removed += 1;
      continue;
    }
    try { await stat(path); } catch { db.prepare('DELETE FROM assets WHERE id=?').run(row.id); removed += 1; }
  }
  for (const directoryName of ['originals', 'captures']) {
    const directory = join(dataDirectory, directoryName);
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || entry.name.endsWith('.partial') || !/^[0-9a-f-]{36}-/i.test(entry.name)) continue;
      const path = join(directory, entry.name);
      if (!registered.has(path)) { await rm(path, { force: true }); removed += 1; }
    }
  }
  return removed;
}

export async function removeOwnedPartials(dataDirectory: string): Promise<void> {
  for (const directory of [join(dataDirectory, 'originals'), join(dataDirectory, 'captures'), join(dataDirectory, 'tmp')]) {
    const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.filter((entry) => entry.isFile() && entry.name.endsWith('.partial')).map((entry) => rm(join(directory, entry.name), { force: true })));
  }
}
