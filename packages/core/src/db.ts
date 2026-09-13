import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const APP_VERSION = '0.1.0';

export function getDataDirectory(): string {
  return process.env.KEEPTRAIL_DATA_DIR ?? join(process.env.HOME ?? process.cwd(), 'Library', 'Application Support', 'Keeptrail');
}

export function ensureDataDirectory(dataDirectory = getDataDirectory()): string {
  mkdirSync(dataDirectory, { recursive: true, mode: 0o700 });
  for (const child of ['originals', 'captures', 'transcripts', 'tmp', 'config', 'exports']) {
    mkdirSync(join(dataDirectory, child), { recursive: true, mode: 0o700 });
  }
  return dataDirectory;
}

const migrations = [
  `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY, type TEXT NOT NULL, platform TEXT NOT NULL, source_url TEXT, canonical_url TEXT,
    platform_id TEXT, content_hash TEXT, title TEXT NOT NULL DEFAULT '', author TEXT, description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL, created_at TEXT NOT NULL, published_at TEXT, duration_ms INTEGER, thumbnail_asset_id TEXT,
    original_deleted_at TEXT, error_code TEXT, error_message TEXT, current_revision INTEGER NOT NULL DEFAULT 1,
    UNIQUE(platform, platform_id), UNIQUE(canonical_url), UNIQUE(content_hash)
  );`,
  `CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, role TEXT NOT NULL,
    relative_path TEXT NOT NULL, mime TEXT NOT NULL, width INTEGER, height INTEGER, bytes INTEGER NOT NULL DEFAULT 0,
    timestamp_ms INTEGER, sha256 TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(item_id, role, relative_path)
  );`,
  `CREATE TABLE IF NOT EXISTS transcript_segments (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, text TEXT NOT NULL,
    start_ms INTEGER NOT NULL, end_ms INTEGER NOT NULL, language TEXT, evidence_id TEXT
  );`,
  `CREATE TABLE IF NOT EXISTS analysis_revisions (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
    title TEXT NOT NULL, summary TEXT NOT NULL, key_points_json TEXT NOT NULL, topics_json TEXT NOT NULL,
    image_descriptors_json TEXT NOT NULL, model_id TEXT, prompt_version TEXT, created_at TEXT NOT NULL,
    UNIQUE(item_id, revision)
  );`,
  `CREATE TABLE IF NOT EXISTS evidence (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
    kind TEXT NOT NULL, label TEXT NOT NULL, excerpt TEXT, start_ms INTEGER, end_ms INTEGER
  );`,
  `CREATE TABLE IF NOT EXISTS websites (
    id TEXT PRIMARY KEY, hostname TEXT, name TEXT NOT NULL, canonical_url TEXT, created_at TEXT NOT NULL,
    UNIQUE(hostname, canonical_url)
  );`,
  `CREATE TABLE IF NOT EXISTS mentions (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, website_id TEXT REFERENCES websites(id) ON DELETE SET NULL,
    unresolved_name TEXT, evidence_id TEXT NOT NULL, literal_url TEXT, certainty TEXT NOT NULL,
    confirmation_status TEXT NOT NULL DEFAULT 'confirmed'
  );`,
  `CREATE TABLE IF NOT EXISTS topics (slug TEXT PRIMARY KEY, label TEXT NOT NULL, color_token TEXT NOT NULL, display_order INTEGER NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS item_topics (item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, topic_slug TEXT NOT NULL REFERENCES topics(slug) ON DELETE CASCADE, PRIMARY KEY(item_id, topic_slug));`,
  `CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, label TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS item_tags (item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(item_id, tag_id));`,
  `CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS collection_items (collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, PRIMARY KEY(collection_id, item_id));`,
  `CREATE TABLE IF NOT EXISTS user_notes (item_id TEXT PRIMARY KEY REFERENCES items(id) ON DELETE CASCADE, body TEXT NOT NULL, updated_at TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS search_chunks (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, source_kind TEXT NOT NULL,
    source_id TEXT NOT NULL, body TEXT NOT NULL, evidence_ids_json TEXT NOT NULL, embedding BLOB
  );`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS search_chunks_fts USING fts5(body, content='search_chunks', content_rowid='rowid');`,
  `CREATE TABLE IF NOT EXISTS embeddings (chunk_id TEXT PRIMARY KEY REFERENCES search_chunks(id) ON DELETE CASCADE, vector BLOB NOT NULL, dimensions INTEGER NOT NULL, model_id TEXT NOT NULL, created_at TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, stage TEXT NOT NULL,
    status TEXT NOT NULL, lease_owner TEXT, lease_expires_at TEXT, attempt_count INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TEXT, cancel_requested INTEGER NOT NULL DEFAULT 0, pause_requested INTEGER NOT NULL DEFAULT 0,
    checkpoint_json TEXT NOT NULL DEFAULT '{}', error_category TEXT, error_message TEXT, created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS stage_results (
    id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE, stage TEXT NOT NULL,
    input_hash TEXT NOT NULL, model_id TEXT, prompt_version TEXT, output_json TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(item_id, stage, input_hash, model_id, prompt_version)
  );`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);`,
  `CREATE TABLE IF NOT EXISTS route_positions (node_id TEXT PRIMARY KEY, x REAL NOT NULL, y REAL NOT NULL, updated_at TEXT NOT NULL);`,
  `CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_jobs_runnable ON jobs(status, next_attempt_at);`,
  `CREATE INDEX IF NOT EXISTS idx_mentions_item ON mentions(item_id);`,
  `CREATE INDEX IF NOT EXISTS idx_segments_item ON transcript_segments(item_id, start_ms);`,
  `ALTER TABLE items ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE IF NOT EXISTS inference_calls (
     id TEXT PRIMARY KEY, item_id TEXT REFERENCES items(id) ON DELETE CASCADE,
     kind TEXT NOT NULL, provider TEXT NOT NULL, requested_model TEXT NOT NULL,
     returned_model TEXT, input_hash TEXT NOT NULL, status TEXT NOT NULL,
     estimated_tokens INTEGER NOT NULL DEFAULT 0, actual_tokens INTEGER,
     retry_after_at TEXT, attempt INTEGER NOT NULL DEFAULT 1,
     outcome_unknown INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
     started_at TEXT, completed_at TEXT
   );
   CREATE INDEX IF NOT EXISTS idx_inference_calls_created ON inference_calls(created_at);
   CREATE INDEX IF NOT EXISTS idx_inference_calls_item ON inference_calls(item_id);
   CREATE TABLE IF NOT EXISTS processing_locks (
     name TEXT PRIMARY KEY, owner TEXT NOT NULL, lease_expires_at TEXT NOT NULL, updated_at TEXT NOT NULL
   );
   CREATE TRIGGER IF NOT EXISTS search_chunks_ai AFTER INSERT ON search_chunks BEGIN
     INSERT INTO search_chunks_fts(rowid, body) VALUES (new.rowid, new.body);
   END;
   CREATE TRIGGER IF NOT EXISTS search_chunks_ad AFTER DELETE ON search_chunks BEGIN
     INSERT INTO search_chunks_fts(search_chunks_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
   END;
   CREATE TRIGGER IF NOT EXISTS search_chunks_au AFTER UPDATE OF body ON search_chunks BEGIN
     INSERT INTO search_chunks_fts(search_chunks_fts, rowid, body) VALUES ('delete', old.rowid, old.body);
     INSERT INTO search_chunks_fts(rowid, body) VALUES (new.rowid, new.body);
   END;
   INSERT INTO search_chunks_fts(search_chunks_fts) VALUES ('rebuild');`,
  `ALTER TABLE items ADD COLUMN cloud_status TEXT NOT NULL DEFAULT 'not_requested';
   CREATE INDEX IF NOT EXISTS idx_items_cloud_status ON items(cloud_status);`,
  `ALTER TABLE items ADD COLUMN parent_item_id TEXT REFERENCES items(id) ON DELETE SET NULL;
   ALTER TABLE items ADD COLUMN media_index INTEGER;
   CREATE INDEX IF NOT EXISTS idx_items_parent_media ON items(parent_item_id, media_index);`
];

export type KeeptrailDb = Database.Database;

export function openDatabase(dataDirectory = getDataDirectory()): KeeptrailDb {
  ensureDataDirectory(dataDirectory);
  const db = new Database(join(dataDirectory, 'keeptrail.sqlite'));
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

export function openReadOnlyDatabase(dataDirectory = getDataDirectory()): KeeptrailDb {
  return new Database(join(dataDirectory, 'keeptrail.sqlite'), { readonly: true, fileMustExist: true });
}

export function migrate(db: KeeptrailDb): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);');
  const applied = new Set((db.prepare('SELECT version FROM schema_migrations ORDER BY version').all() as Array<{ version: number }>).map((row) => row.version));
  const apply = db.transaction(() => {
    migrations.forEach((sql, index) => {
      const version = index + 1;
      if (applied.has(version)) return;
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
    });
    seedTopics(db);
  });
  apply();
}

const topicSeeds = [
  ['design', 'Design', 'sage'], ['typography', 'Typography', 'lilac'], ['animation', 'Animation', 'ochre'],
  ['development', 'Development', 'sage'], ['ai-tools', 'AI tools', 'plum'], ['photography', 'Photography', 'coral'],
  ['learning', 'Learning', 'blue'], ['other', 'Other', 'muted']
] as const;

export function seedTopics(db: KeeptrailDb): void {
  const insert = db.prepare('INSERT OR IGNORE INTO topics (slug, label, color_token, display_order) VALUES (?, ?, ?, ?)');
  topicSeeds.forEach(([slug, label, color], index) => insert.run(slug, label, color, index));
}

export function closeDatabase(db: KeeptrailDb): void {
  db.close();
}
