# Architecture

Status 2026-09-13: **architecture not accepted**. This describes the current component layout, not verified pipeline guarantees. See [CODE_REVIEW.md](CODE_REVIEW.md): heavy-lock renewal, atomic stage completion, active cancellation, local indexing, embedding isolation and viewport selection remain incomplete. MCP currently reads SQLite directly; the API arrow below is the intended contract, not the implemented MCP transport.

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
- `apps/worker`: one-job-at-a-time lease loop. The real media path uses yt-dlp, FFmpeg, and Whisper.cpp; the cloud path uses only the selected model through the managed OmniRoute gateway. Unsupported prerequisites become explicit typed states.
- `apps/mcp`: read-only stdio server exposing library, topic, processing-status, and capability tools.
- `packages/shared`: Zod contracts used at the API boundary and by the UI.
- `packages/core`: migrations, URL normalization, library queries, graph derivation, and worker pipeline helpers.

## Storage

The default data directory is `~/Library/Application Support/Keeptrail`. It is created mode 0700 with subdirectories for originals, captures, transcripts, temporary files, config, and exports. SQLite uses WAL mode, foreign keys, a busy timeout, migration bookkeeping, FTS5 tables, and job lease columns.

URL imports are deduplicated by provider identity or canonical URL. Local files are content-hash deduplicated. Every source has a durable item row and a durable job row so a worker restart does not erase the user's library.

## API boundary

The server binds to `127.0.0.1` only. Mutating requests accept no cross-origin origin except the local development ports. URL imports reject credentials, unsupported ports, and private/local destinations before a fetch. HTML responses are capped at 5 MiB and sanitized before indexing. Uploads are limited to JPEG, PNG, WebP, MP4, MOV, and WebM with a 500 MiB cap.

The intended provider/media boundary requires no remote fallback or implicit demo seeding. The gateway supervisor uses loopback port 20129 and refuses an unmanaged listener. Address-validation and media-protocol gaps identified in the review mean the current implementation must not be described as enforcing the complete network boundary. Completed job rows also do not yet guarantee truthful item readiness or complete indexing.
