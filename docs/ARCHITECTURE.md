# Architecture

Keeptrail is a small local service with a browser UI and a separate worker process:

```text
Browser UI (React/Vite)
        │ loopback HTTP
        ▼
Fastify API ─── SQLite + FTS schema ─── local data directory
        ▲                                  │
        │                                  ▼
      MCP stdio                     originals / captures / transcripts
        ▲
   coding agent

Worker ── leases queued jobs from the same SQLite database
```

## Processes

- `apps/web`: desktop-first Search, Explore, and Settings UI. It only calls the local API.
- `apps/server`: loopback-only HTTP API, static web host, import validation, file limits, note/tag updates, exports, and asset serving.
- `apps/worker`: one-job-at-a-time lease loop. Ordinary pages use Readability and sanitized local text extraction. Unsupported media/cloud stages become explicit `waiting_for_key` or `needs_review` states.
- `apps/mcp`: stdio server exposing `search_library`, `get_item`, `get_passages`, and `list_topics` as read-only tools.
- `packages/shared`: Zod contracts used at the API boundary and by the UI.
- `packages/core`: migrations, URL normalization, library queries, graph derivation, and worker pipeline helpers.

## Storage

The default data directory is `~/Library/Application Support/Keeptrail`. It is created mode 0700 with subdirectories for originals, captures, transcripts, temporary files, config, and exports. SQLite uses WAL mode, foreign keys, a busy timeout, migration bookkeeping, FTS5 tables, and job lease columns.

URL imports are deduplicated by provider identity or canonical URL. Local files are content-hash deduplicated. Every source has a durable item row and a durable job row so a worker restart does not erase the user's library.

## API boundary

The server binds to `127.0.0.1` only. Mutating requests accept no cross-origin origin except the local development ports. URL imports reject credentials, unsupported ports, and private/local destinations before a fetch. HTML responses are capped at 5 MiB and sanitized before indexing. Uploads are limited to JPEG, PNG, WebP, MP4, MOV, and WebM with a 500 MiB cap.

The current implementation intentionally keeps the provider/media boundary explicit. There is no silent remote fallback, no automatic demo seed, and no claim that a social link or cloud model succeeded when it did not.
