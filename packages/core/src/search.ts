import { pipeline } from '@huggingface/transformers';
import type { KeeptrailDb } from './db.js';
import { newId } from './normalize.js';

export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';
export const EMBEDDING_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78';
export const EMBEDDING_DIMENSIONS = 384;

type Extractor = (text: string, options: { pooling: 'mean'; normalize: true }) => Promise<{ data: Float32Array | ArrayLike<number> }>;
let extractorPromise: Promise<Extractor> | null = null;

export async function embedText(text: string, prefix: 'query: ' | 'passage: '): Promise<Float32Array> {
  extractorPromise ??= pipeline('feature-extraction', EMBEDDING_MODEL, { revision: EMBEDDING_REVISION, dtype: 'q8', device: 'cpu' }).then((value) => value as unknown as Extractor);
  const output = await (await extractorPromise)(`${prefix}${text.slice(0, 2_000)}`, { pooling: 'mean', normalize: true });
  const vector = Float32Array.from(output.data);
  if (vector.length !== EMBEDDING_DIMENSIONS) throw new Error(`Embedding dimension mismatch: expected ${EMBEDDING_DIMENSIONS}.`);
  return vector;
}

export function disposeEmbeddingModel(): void { extractorPromise = null; }

export function upsertSearchChunk(db: KeeptrailDb, input: { itemId: string; sourceKind: string; sourceId: string; body: string; evidenceIds: string[]; embedding?: Float32Array; modelId?: string }): string {
  const existing = db.prepare('SELECT id FROM search_chunks WHERE item_id=? AND source_kind=? AND source_id=? LIMIT 1').get(input.itemId, input.sourceKind, input.sourceId) as { id: string } | undefined;
  const id = existing?.id ?? newId();
  const vector = input.embedding ? Buffer.from(input.embedding.buffer, input.embedding.byteOffset, input.embedding.byteLength) : null;
  db.transaction(() => {
    if (existing) db.prepare('UPDATE search_chunks SET body=?,evidence_ids_json=?,embedding=? WHERE id=?').run(input.body, JSON.stringify(input.evidenceIds), vector, id);
    else db.prepare('INSERT INTO search_chunks (id,item_id,source_kind,source_id,body,evidence_ids_json,embedding) VALUES (?,?,?,?,?,?,?)').run(id, input.itemId, input.sourceKind, input.sourceId, input.body, JSON.stringify(input.evidenceIds), vector);
    db.prepare('DELETE FROM embeddings WHERE chunk_id=?').run(id);
    if (input.embedding) db.prepare('INSERT INTO embeddings (chunk_id,vector,dimensions,model_id,created_at) VALUES (?,?,?,?,?)').run(id, vector, input.embedding.length, input.modelId ?? `${EMBEDDING_MODEL}@${EMBEDDING_REVISION}`, new Date().toISOString());
  })();
  return id;
}

function ftsQuery(query: string): string {
  return query.split(/\s+/).map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, '')).filter(Boolean).map((term) => `"${term.replaceAll('"', '')}"`).join(' AND ');
}

export function keywordItemRanking(db: KeeptrailDb, query: string, limit = 50): Array<{ itemId: string; rank: number; chunkId: string; evidenceId: string | null }> {
  const match = ftsQuery(query);
  if (!match) return [];
  try {
    return (db.prepare(`SELECT sc.item_id AS itemId, bm25(search_chunks_fts) AS rank, sc.id AS chunkId, json_extract(sc.evidence_ids_json, '$[0]') AS evidenceId FROM search_chunks_fts JOIN search_chunks sc ON sc.rowid=search_chunks_fts.rowid WHERE search_chunks_fts MATCH ? ORDER BY rank, sc.item_id LIMIT ?`).all(match, limit) as Array<{ itemId: string; rank: number; chunkId: string; evidenceId: string | null }>);
  } catch {
    return [];
  }
}

function cosine(left: Float32Array, right: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) sum += left[index]! * right[index]!;
  return sum;
}

function decodeVector(buffer: Buffer): Float32Array { return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT); }

export function semanticItemRanking(db: KeeptrailDb, queryVector: Float32Array, limit = 50): Array<{ itemId: string; rank: number; chunkId: string; evidenceId: string | null }> {
  const rows = db.prepare('SELECT e.chunk_id AS chunkId, e.vector, sc.item_id AS itemId, json_extract(sc.evidence_ids_json, \'$[0]\') AS evidenceId FROM embeddings e JOIN search_chunks sc ON sc.id=e.chunk_id WHERE e.dimensions=?').all(queryVector.length) as Array<{ chunkId: string; vector: Buffer; itemId: string; evidenceId: string | null }>;
  return rows.map((row) => ({ itemId: row.itemId, rank: cosine(queryVector, decodeVector(row.vector)), chunkId: row.chunkId, evidenceId: row.evidenceId })).sort((a, b) => b.rank - a.rank || a.itemId.localeCompare(b.itemId)).slice(0, limit);
}

export function reciprocalRankFusion(keyword: Array<{ itemId: string; rank: number; chunkId: string; evidenceId: string | null }>, semantic: Array<{ itemId: string; rank: number; chunkId: string; evidenceId: string | null }>, k = 60, limit = 50): string[] {
  const scores = new Map<string, number>();
  const add = (rows: typeof keyword) => rows.forEach((row, index) => scores.set(row.itemId, (scores.get(row.itemId) ?? 0) + 1 / (k + index + 1)));
  add(keyword); add(semantic);
  return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([id]) => id);
}
