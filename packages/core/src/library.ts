import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import type { KeeptrailDb } from './db.js';
import { normalizeSource, normalizeTag, newId } from './normalize.js';
import type { GraphResponse, ItemDetail, LibraryItem, LibraryResponse, Topic } from '@keeptrail/shared';

type ItemRow = {
  id: string; type: LibraryItem['type']; platform: LibraryItem['platform']; source_url: string | null; platform_id: string | null;
  title: string; author: string | null; status: LibraryItem['status']; created_at: string; published_at: string | null;
  duration_ms: number | null; thumbnail_asset_id: string | null; summary: string; website_count: number; original_bytes: number | null;
};

const topicColors: Record<string, Topic['colorToken']> = { sage: 'sage', ochre: 'ochre', lilac: 'lilac', coral: 'coral', blue: 'blue', moss: 'moss', plum: 'plum', muted: 'muted' };

function mapItem(row: ItemRow, db: KeeptrailDb, query?: string): LibraryItem {
  const tags = (db.prepare('SELECT t.label FROM tags t JOIN item_tags it ON it.tag_id=t.id WHERE it.item_id=? ORDER BY t.label').all(row.id) as Array<{ label: string }>).map((tag) => tag.label);
  const topics = (db.prepare('SELECT topic_slug FROM item_topics WHERE item_id=? ORDER BY topic_slug').all(row.id) as Array<{ topic_slug: string }>).map((topic) => topic.topic_slug);
  const match = query ? (db.prepare('SELECT body, evidence_ids_json FROM search_chunks WHERE item_id=? AND body LIKE ? ORDER BY rowid LIMIT 1').get(row.id, `%${query}%`) as { body: string; evidence_ids_json: string } | undefined) : undefined;
  return {
    id: row.id, type: row.type, platform: row.platform, sourceUrl: row.source_url, platformId: row.platform_id,
    title: row.title, author: row.author, summary: row.summary, status: row.status, createdAt: row.created_at,
    publishedAt: row.published_at, durationMs: row.duration_ms, thumbnailUrl: null, thumbnailAssetId: row.thumbnail_asset_id,
    topics, tags, match: match ? { text: match.body.slice(0, 500), evidenceId: JSON.parse(match.evidence_ids_json)[0] } : null,
    websiteCount: row.website_count, originalBytes: row.original_bytes
  };
}

function itemSelect(): string {
  return `SELECT i.id, i.type, i.platform, i.source_url, i.platform_id, i.title, i.author, i.status, i.created_at,
    i.published_at, i.duration_ms, i.thumbnail_asset_id,
    COALESCE((SELECT ar.summary FROM analysis_revisions ar WHERE ar.item_id=i.id ORDER BY ar.revision DESC LIMIT 1), i.description) AS summary,
    (SELECT COUNT(*) FROM mentions m WHERE m.item_id=i.id) AS website_count,
    (SELECT SUM(a.bytes) FROM assets a WHERE a.item_id=i.id AND a.role='original') AS original_bytes
    FROM items i`;
}

export function listLibrary(db: KeeptrailDb, params: { query?: string; topic?: string; platform?: string; tag?: string; limit?: number; offset?: number } = {}): LibraryResponse {
  const where: string[] = [];
  const values: Array<string | number> = [];
  const query = params.query?.trim() ?? '';
  if (query) {
    where.push(`(i.title LIKE ? OR i.description LIKE ? OR EXISTS (SELECT 1 FROM search_chunks sc WHERE sc.item_id=i.id AND sc.body LIKE ?))`);
    values.push(`%${query}%`, `%${query}%`, `%${query}%`);
  }
  if (params.topic) { where.push('EXISTS (SELECT 1 FROM item_topics itf WHERE itf.item_id=i.id AND itf.topic_slug=?)'); values.push(params.topic); }
  if (params.platform) { where.push('i.platform=?'); values.push(params.platform); }
  if (params.tag) { where.push('EXISTS (SELECT 1 FROM item_tags itf JOIN tags tf ON tf.id=itf.tag_id WHERE itf.item_id=i.id AND tf.label=?)'); values.push(params.tag); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = (db.prepare(`SELECT COUNT(*) AS count FROM items i ${clause}`).get(...values) as { count: number }).count;
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const offset = Math.max(params.offset ?? 0, 0);
  const rows = db.prepare(`${itemSelect()} ${clause} ORDER BY i.created_at DESC, i.id DESC LIMIT ? OFFSET ?`).all(...values, limit, offset) as ItemRow[];
  const topics = db.prepare(`SELECT t.slug, t.label, t.color_token, COUNT(it.item_id) AS itemCount FROM topics t LEFT JOIN item_topics it ON it.topic_slug=t.slug GROUP BY t.slug ORDER BY t.display_order`).all() as Array<{ slug: string; label: string; color_token: string; itemCount: number }>;
  const tags = db.prepare('SELECT t.label, COUNT(it.item_id) AS count FROM tags t JOIN item_tags it ON it.tag_id=t.id GROUP BY t.id ORDER BY count DESC, t.label LIMIT 50').all() as Array<{ label: string; count: number }>;
  const platformRows = db.prepare('SELECT platform, COUNT(*) AS count FROM items GROUP BY platform').all() as Array<{ platform: LibraryItem['platform']; count: number }>;
  const platformCounts = { youtube: 0, instagram: 0, tiktok: 0, x: 0, web: 0, local: 0 } as Record<LibraryItem['platform'], number>;
  platformRows.forEach((row) => { platformCounts[row.platform] = row.count; });
  const processingCount = (db.prepare(`SELECT COUNT(*) AS count FROM items WHERE status NOT IN ('ready','failed','canceled')`).get() as { count: number }).count;
  return { items: rows.map((row) => mapItem(row, db, query)), total, mode: 'keyword', topics: topics.map((row) => ({ slug: row.slug, label: row.label, colorToken: topicColors[row.color_token] ?? 'muted', itemCount: row.itemCount })), tags, platformCounts, processingCount };
}

export function getItemDetail(db: KeeptrailDb, id: string): ItemDetail | null {
  const row = db.prepare(`${itemSelect()} WHERE i.id=?`).get(id) as ItemRow | undefined;
  if (!row) return null;
  const base = mapItem(row, db);
  const revision = db.prepare('SELECT title, summary, key_points_json, image_descriptors_json FROM analysis_revisions WHERE item_id=? ORDER BY revision DESC LIMIT 1').get(id) as { title: string; summary: string; key_points_json: string; image_descriptors_json: string } | undefined;
  const evidence = db.prepare('SELECT id, kind, label, excerpt, start_ms, end_ms FROM evidence WHERE item_id=? ORDER BY rowid').all(id) as Array<{ id: string; kind: ItemDetail['evidence'][number]['kind']; label: string; excerpt?: string; start_ms?: number; end_ms?: number }>;
  const websites = db.prepare(`SELECT m.id, COALESCE(w.name,m.unresolved_name) AS name, m.literal_url, m.certainty, m.confirmation_status, m.evidence_id FROM mentions m LEFT JOIN websites w ON w.id=m.website_id WHERE m.item_id=? ORDER BY m.rowid`).all(id) as Array<{ id: string; name: string; literal_url: string | null; certainty: 'explicit' | 'uncertain'; confirmation_status: 'confirmed' | 'needs_checking'; evidence_id: string }>;
  const transcriptRows = db.prepare('SELECT id, text, start_ms, end_ms FROM transcript_segments WHERE item_id=? ORDER BY start_ms LIMIT 500').all(id) as Array<{ id: string; text: string; start_ms: number; end_ms: number }>;
  const note = (db.prepare('SELECT body FROM user_notes WHERE item_id=?').get(id) as { body: string } | undefined)?.body ?? '';
  const captures = db.prepare(`SELECT a.id, a.relative_path, a.timestamp_ms FROM assets a WHERE a.item_id=? AND a.role='capture' ORDER BY a.timestamp_ms`).all(id) as Array<{ id: string; relative_path: string; timestamp_ms: number | null }>;
  const collections = db.prepare('SELECT c.id, c.name FROM collections c JOIN collection_items ci ON ci.collection_id=c.id WHERE ci.item_id=? ORDER BY c.name').all(id) as Array<{ id: string; name: string }>;
  return {
    ...base,
    title: revision?.title ?? base.title,
    summary: revision?.summary ?? base.summary,
    keyPoints: revision ? JSON.parse(revision.key_points_json) : [],
    websites: websites.map((website) => ({ id: website.id, name: website.name, literalUrl: website.literal_url, description: '', certainty: website.certainty, confirmationStatus: website.confirmation_status, evidenceIds: [website.evidence_id] })),
    evidence: evidence.map((item) => ({
      id: item.id,
      kind: item.kind,
      label: item.label,
      ...(item.excerpt ? { excerpt: item.excerpt } : {}),
      ...(item.start_ms === null || item.start_ms === undefined ? {} : { startMs: item.start_ms }),
      ...(item.end_ms === null || item.end_ms === undefined ? {} : { endMs: item.end_ms })
    })),
    note,
    transcript: transcriptRows.map((segment) => ({ id: segment.id, text: segment.text, startMs: segment.start_ms, endMs: segment.end_ms })),
    captures: captures.map((capture) => ({ id: capture.id, url: `/api/assets/${capture.id}`, label: basename(capture.relative_path), timestampMs: capture.timestamp_ms, alt: `Capture from ${capture.timestamp_ms === null ? 'source' : `${Math.round(capture.timestamp_ms / 1000)} seconds`}`, descriptors: { subject: [], style: [], layout: [] } })),
    collections
  };
}

export function importUrl(db: KeeptrailDb, raw: string, now = new Date().toISOString()): { kind: 'created' | 'existing'; id: string; url: string; status: LibraryItem['status'] } {
  const source = normalizeSource(raw);
  const existing = db.prepare('SELECT id, status FROM items WHERE platform=? AND platform_id IS ? OR canonical_url=?').get(source.platform, source.platformId, source.canonicalUrl) as { id: string; status: LibraryItem['status'] } | undefined;
  if (existing) return { kind: 'existing', id: existing.id, url: source.canonicalUrl, status: existing.status };
  const id = newId();
  const jobId = newId();
  const title = source.platform === 'web' ? new URL(source.canonicalUrl).hostname : `Saved ${source.platform} source`;
  const create = db.transaction(() => {
    db.prepare(`INSERT INTO items (id,type,platform,source_url,canonical_url,platform_id,title,description,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(id, source.platform === 'web' ? 'page' : 'video', source.platform, source.url, source.canonicalUrl, source.platformId, title, '', 'queued', now);
    db.prepare(`INSERT INTO jobs (id,item_id,stage,status,created_at,updated_at) VALUES (?,?,?,'queued',?,?)`).run(jobId, id, 'acquire', now, now);
    db.prepare(`INSERT INTO search_chunks (id,item_id,source_kind,source_id,body,evidence_ids_json) VALUES (?,?,?,?,?,?)`).run(newId(), id, 'description', `description:${id}`, title, JSON.stringify([`description:${id}`]));
  });
  create();
  return { kind: 'created', id, url: source.canonicalUrl, status: 'queued' };
}

export function updateItem(db: KeeptrailDb, itemId: string, input: { note?: string; tags?: string[]; collectionIds?: string[] }, now = new Date().toISOString()): void {
  const tx = db.transaction(() => {
    if (input.note !== undefined) db.prepare(`INSERT INTO user_notes (item_id,body,updated_at) VALUES (?,?,?) ON CONFLICT(item_id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at`).run(itemId, input.note, now);
    if (input.tags) {
      db.prepare('DELETE FROM item_tags WHERE item_id=?').run(itemId);
      const insertTag = db.prepare('INSERT OR IGNORE INTO tags (id,label,created_at) VALUES (?,?,?)');
      const link = db.prepare('INSERT OR IGNORE INTO item_tags (item_id,tag_id) SELECT ?, id FROM tags WHERE label=?');
      for (const raw of input.tags) { const label = normalizeTag(raw); if (label) { insertTag.run(randomUUID(), label, now); link.run(itemId, label); } }
    }
    if (input.collectionIds) { db.prepare('DELETE FROM collection_items WHERE item_id=?').run(itemId); const link = db.prepare('INSERT OR IGNORE INTO collection_items (collection_id,item_id) VALUES (?,?)'); input.collectionIds.forEach((collectionId) => link.run(collectionId, itemId)); }
    db.prepare(`UPDATE items SET current_revision=current_revision+1 WHERE id=?`).run(itemId);
  });
  tx();
}

export function graph(db: KeeptrailDb, selectedTopic: string | null = null, selectedItemId: string | null = null): GraphResponse {
  const nodes: GraphResponse['nodes'] = [];
  const edges: GraphResponse['edges'] = [];
  const topics = db.prepare('SELECT slug,label,color_token,display_order FROM topics ORDER BY display_order').all() as Array<{ slug: string; label: string; color_token: Topic['colorToken']; display_order: number }>;
  const visibleTopics = selectedTopic ? topics.filter((topic) => topic.slug === selectedTopic) : topics;
  visibleTopics.forEach((topic, index) => nodes.push({ id: `topic:${topic.slug}`, kind: 'topic', label: topic.label, colorToken: topicColors[topic.color_token] ?? 'muted', x: 120, y: 120 + index * 120, selected: topic.slug === selectedTopic }));
  const itemRows = db.prepare(`${itemSelect()} WHERE (? IS NULL OR EXISTS (SELECT 1 FROM item_topics it WHERE it.item_id=i.id AND it.topic_slug=?)) ORDER BY i.created_at, i.id LIMIT 50`).all(selectedTopic, selectedTopic) as ItemRow[];
  itemRows.forEach((item, index) => {
    const topic = (db.prepare('SELECT topic_slug FROM item_topics WHERE item_id=? ORDER BY topic_slug LIMIT 1').get(item.id) as { topic_slug: string } | undefined)?.topic_slug ?? 'other';
    const laneIndex = Math.max(0, visibleTopics.findIndex((candidate) => candidate.slug === topic));
    const nodeId = `item:${item.id}`;
    nodes.push({ id: nodeId, kind: 'item', itemId: item.id, label: item.title || 'Untitled source', subtitle: item.platform, x: 320 + (index % 5) * 190, y: 120 + laneIndex * 120, selected: item.id === selectedItemId });
    edges.push({ id: `topic-edge:${topic}:${item.id}`, from: `topic:${topic}`, to: nodeId, kind: 'topic', colorToken: topicColors[topics.find((candidate) => candidate.slug === topic)?.color_token ?? 'muted'] ?? 'muted' });
  });
  const websites = db.prepare(`SELECT w.id,w.name,COUNT(m.item_id) AS uses FROM websites w JOIN mentions m ON m.website_id=w.id ${selectedTopic ? 'JOIN item_topics it ON it.item_id=m.item_id AND it.topic_slug=?' : ''} GROUP BY w.id ORDER BY uses DESC LIMIT 20`).all(...(selectedTopic ? [selectedTopic] : [])) as Array<{ id: string; name: string; uses: number }>;
  websites.forEach((website, index) => {
    const nodeId = `website:${website.id}`;
    nodes.push({ id: nodeId, kind: 'website', label: website.name, subtitle: `${website.uses} mention${website.uses === 1 ? '' : 's'}`, x: 1120, y: 100 + index * 68, selected: false });
    const linked = db.prepare(`SELECT item_id FROM mentions WHERE website_id=? LIMIT 4`).all(website.id) as Array<{ item_id: string }>;
    linked.forEach((item) => { if (nodes.some((node) => node.id === `item:${item.item_id}`)) edges.push({ id: `website-edge:${website.id}:${item.item_id}`, from: `item:${item.item_id}`, to: nodeId, kind: 'website', label: 'mentioned' }); });
  });
  return { nodes: nodes.slice(0, 80), edges: edges.slice(0, 120), topic: selectedTopic, visibleCount: itemRows.length, hasMore: itemRows.length === 50 };
}

export function seedDemo(db: KeeptrailDb): void {
  const now = new Date().toISOString();
  const seed = db.transaction(() => {
    const examples = [
      { title: 'A calmer way to choose type', platform: 'youtube', url: 'https://www.youtube.com/watch?v=keeptrail-type', author: 'Studio Notes', topic: 'typography', tags: ['type', 'references'], summary: 'A concise walkthrough of type systems that stay readable under pressure.', site: 'Typewolf', siteUrl: 'https://www.typewolf.com', color: 'lilac' },
      { title: 'Interfaces that leave room to think', platform: 'instagram', url: 'https://www.instagram.com/reel/keeptrail-space', author: '@fieldnotes', topic: 'design', tags: ['editorial', 'web design'], summary: 'Notes on pacing, contrast, and the small details that make interfaces feel considered.', site: 'Are.na', siteUrl: 'https://www.are.na', color: 'sage' },
      { title: 'Motion with a reason', platform: 'tiktok', url: 'https://www.tiktok.com/@motion/video/987654321', author: '@motionstudy', topic: 'animation', tags: ['motion', 'interaction'], summary: 'A practical collection of interface transitions that clarify what changed and why.', site: 'LottieFiles', siteUrl: 'https://lottiefiles.com', color: 'ochre' },
      { title: 'A visual notebook for research', platform: 'web', url: 'https://read.cv/field-notes', author: 'Field Notes', topic: 'learning', tags: ['research', 'notes'], summary: 'A field guide to keeping sources close to the ideas they support.', site: 'Read.cv', siteUrl: 'https://read.cv', color: 'blue' }
    ] as const;
    const insertTopic = db.prepare('INSERT OR IGNORE INTO item_topics (item_id,topic_slug) VALUES (?,?)');
    const insertTag = db.prepare('INSERT OR IGNORE INTO tags (id,label,created_at) VALUES (?,?,?)');
    const linkTag = db.prepare('INSERT OR IGNORE INTO item_tags (item_id,tag_id) SELECT ?,id FROM tags WHERE label=?');
    examples.forEach((example, index) => {
      const id = `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`;
      const websiteId = `22222222-2222-4222-8222-${String(index + 1).padStart(12, '0')}`;
      if (!db.prepare('SELECT 1 FROM items WHERE id=?').get(id)) {
        db.prepare(`INSERT INTO items (id,type,platform,source_url,canonical_url,platform_id,title,author,description,status,created_at,published_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, example.platform === 'web' ? 'page' : 'video', example.platform, example.url, example.url, `demo-${index}`, example.title, example.author, example.summary, 'ready', new Date(Date.now() - index * 86400000).toISOString(), now);
        db.prepare(`INSERT INTO analysis_revisions (id,item_id,revision,title,summary,key_points_json,topics_json,image_descriptors_json,model_id,prompt_version,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(randomUUID(), id, 1, example.title, example.summary, JSON.stringify([{ text: example.summary, evidenceIds: [`description:${id}`] }]), JSON.stringify([example.topic]), JSON.stringify({ subject: [], style: [], layout: [] }), 'demo-fixture', 'demo-v1', now);
        db.prepare(`INSERT INTO evidence (id,item_id,revision,kind,label,excerpt) VALUES (?,?,?,?,?,?)`).run(`description:${id}`, id, 1, 'description', 'Source description', example.summary);
        db.prepare(`INSERT INTO search_chunks (id,item_id,source_kind,source_id,body,evidence_ids_json) VALUES (?,?,?,?,?,?)`).run(randomUUID(), id, 'description', `description:${id}`, `${example.title} ${example.summary} ${example.tags.join(' ')}`, JSON.stringify([`description:${id}`]));
        db.prepare(`INSERT INTO websites (id,hostname,name,canonical_url,created_at) VALUES (?,?,?,?,?)`).run(websiteId, new URL(example.siteUrl).hostname, example.site, example.siteUrl, now);
        db.prepare(`INSERT INTO mentions (id,item_id,website_id,evidence_id,literal_url,certainty,confirmation_status) VALUES (?,?,?,?,?,?,?)`).run(randomUUID(), id, websiteId, `description:${id}`, example.siteUrl, 'explicit', 'confirmed');
        insertTopic.run(id, example.topic);
        example.tags.forEach((tag) => { insertTag.run(randomUUID(), normalizeTag(tag), now); linkTag.run(id, normalizeTag(tag)); });
      }
    });
  });
  seed();
}

export function hashText(value: string): string { return createHash('sha256').update(value).digest('hex'); }
