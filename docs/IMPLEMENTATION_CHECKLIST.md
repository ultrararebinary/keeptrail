# Keeptrail implementation checklist

Review 2026-09-13: **not accepted**. The table below is a target checklist, not proof that its named tests exist or pass. See [CODE_REVIEW.md](CODE_REVIEW.md) for confirmed blockers and [TEST_REPORT.md](TEST_REPORT.md) for the smaller set of checks actually run. All areas remain in progress; external prerequisites do not account for the internal failures.

This checklist turns `docs/LUNA_PIPELINES_PROMPT.md` into an executable delivery matrix. It is deliberately scoped to the existing Keeptrail architecture: React/Vite web, Fastify API, SQLite, a separate worker, local FFmpeg/whisper.cpp/Transformers.js processes, and a managed loopback OmniRoute gateway.

## Acceptance matrix and ownership

| Area | Acceptance signal | Primary ownership | Verification evidence | State |
| --- | --- | --- | --- | --- |
| Repository and migration safety | Existing work is preserved; numbered migrations extend the database | `docs/`, `packages/core/src/db.ts` | `git diff`, migration tests | In progress |
| URL normalization and egress | Exact platform IDs, distinct web paths, public DNS/redirect enforcement | `packages/core/src/normalize.ts`, `packages/core/src/network.ts` | parser, DNS, redirect, proxy tests | In progress |
| Upload and assets | Streamed bounded uploads, atomic owned asset lifecycle, range serving | `packages/core/src/assets.ts`, `apps/server/src/index.ts` | truncation, hash, traversal, range tests | In progress |
| Tool provisioning | Idempotent Node/Python/FFmpeg/ffprobe/yt-dlp/whisper/OmniRoute setup with lock and checksums | `scripts/setup.mjs`, `scripts/doctor.mjs`, `scripts/bootstrap.sh`, `docs/DEPENDENCIES.md` | doctor/setup tests and real version probes | In progress |
| Durable processing | Stages, SQLite leases, heartbeat, one heavy local job, restart and valid transitions | `packages/core/src/pipeline.ts`, `apps/worker/src/index.ts`, migrations | competing-worker, lease, pause/resume/cancel tests | In progress |
| Social acquisition | Real yt-dlp argument-array acquisition through enforcing loopback proxy | `packages/core/src/acquisition.ts`, `packages/core/src/network.ts` | fixture downloader/proxy integration; live gates separate | In progress |
| Media analysis | ffprobe, audio normalization, whisper.cpp JSON parsing, Base/Small benchmark rule | `packages/core/src/media.ts`, `scripts/benchmark.mjs` | recorded parser fixtures, synthetic media, local benchmark | In progress |
| Frame coverage | 2fps candidates, economical/detailed deterministic planner, bounded JPEGs | `packages/core/src/frames.ts` | VFR/rotation, URL-change, coverage tests | In progress |
| Gateway and providers | Managed OmniRoute 3.8.50, selected allowlist, text+vision health, no fallback | `packages/core/src/gateway.ts`, `packages/core/src/providers.ts`, settings API | disposable gateway contract tests; live provider gate | In progress |
| Quota and batches | Atomic reservations, 30-call cap, spacing, retry-after, bounded batches/context | `packages/core/src/quota.ts`, `packages/core/src/analysis.ts` | 401/403/429/5xx/restart/schema tests | In progress |
| Evidence and synthesis | Strict versioned schemas, evidence IDs/regions/timestamps, repair once, honest review states | `packages/shared/src/index.ts`, `packages/core/src/analysis.ts` | hostile model-output and synthesis tests | In progress |
| Search and indexing | FTS5 synchronization, pinned E5 q8 embeddings, RRF keyword/semantic ranking | `packages/core/src/search.ts`, `packages/core/src/library.ts` | French/English semantic fixture and ranking tests | In progress |
| Bounded APIs | Cursors for jobs/transcript/captures/evidence/library/map; 400/404/409 semantics | `apps/server/src/index.ts`, `packages/shared/src/index.ts` | API contract tests | In progress |
| Search/Explore UI | Honest stage capabilities, pagination, virtualized lists, viewport map, list alternative | `apps/web/src/App.tsx`, `apps/web/src/ProcessingDetails.tsx`, `apps/web/src/app.css` | RTL, Playwright 1440/1280, reduced-motion/a11y checks | In progress |
| Player and images | Lazy thumbnails, explicit detail player, authenticated range requests, bounded playback proxy | `apps/server/src/index.ts`, `apps/web/src/App.tsx` | range/path/media-request tests and Playwright | In progress |
| Diagnostics and MCP | Sanitized status/capabilities, request/job IDs, read-only authenticated MCP API | `packages/core/src/diagnostics.ts`, `apps/server/src/index.ts`, `apps/mcp/src/index.ts`, `scripts/debug.mjs` | redaction, MCP protocol/auth/shape tests | In progress |
| Documentation and evidence | Status, architecture, privacy, dependencies, test report and quickstart match reality | `docs/*.md`, `README.md`, `QUICKSTART.md`, `SECURITY.md`, `.env.example` | fresh-start review and test report | In progress |

## Execution order

1. Lock normalization, upload, network, migration and current false-success behavior with isolated tests.
2. Implement safe subprocess, network policy and streamed asset finalization.
3. Implement durable stage claims, leases, checkpointing, pause/resume/cancel and worker shutdown.
4. Implement social acquisition, probing, audio/transcription and frame planning.
5. Implement managed OmniRoute, provider health, durable quota, frame batches and evidence synthesis.
6. Implement semantic indexing, bounded data endpoints, thumbnails/player and viewport-aware map.
7. Run deterministic acceptance, isolated E2E, lint/typecheck/build and measured benchmarks; update status and docs.

## Explicit non-passes

- A saved provider key is not a healthy gateway.
- Mocked inference is deterministic-test evidence only, never live-provider evidence.
- A browser login is not download success.
- Missing Homebrew/FFmpeg/ffprobe/whisper/yt-dlp/OmniRoute or provider quota is reported as an external blocker, not converted to a passing capability.
- The supplied Instagram URL is the only live social source authorized by the contract; other platform live checks remain pending without user-selected URLs.
