# Keeptrail — implementation contract for GPT 5.6 Luna / xhigh

Prepared 2026-09-12 after inspecting the current repository and official upstream documentation. This is an implementation prompt, not evidence that the requested pipelines already work. Configure the coding model and reasoning effort in the host UI; this file cannot change those settings.

## 1. Mission and precedence

Finish the existing Keeptrail application so a user can import an individual Instagram, TikTok, X or YouTube video, process it locally, analyze selected transcript text and captures through a free cloud provider via OmniRoute, and retrieve the results through Search and Explore. Implement working integrations, not more placeholders, simulated progress or documentation-only support.

Work in the current Keeptrail repository. Preserve all existing tracked and untracked work, including the recent diagnostics changes. First inspect `git status` and the current code. Do not reset, discard, overwrite unrelated work or rebuild the application from scratch. Do not publish, push or create a release as part of this prompt.

Read `AGENTS.md` if present, `PRODUCT.md`, `DESIGN.md`, this complete file, `docs/DEBUGGING.md`, `docs/MVP_AGENT_PROMPT.md`, the root package manifests, and all relevant source/tests. This file supersedes the older implementation prompt where they conflict: multiple explicitly selected free providers are allowed; Brave is supported; Whisper selection follows the deterministic experiment below; image sampling follows section 6. Preserve the remaining security, privacy, local-storage and evidence requirements of the older prompt. Update stale documents to reflect the actual implementation.

Do not reopen product design or ask the user to choose a framework. Make routine internal coding choices, but do not substitute the technologies, models, limits or acceptance criteria below. If a pinned dependency is unavailable, show the precise upstream failure and continue independent work. Do not silently replace it. A missing video pipeline is implementation work, not a credential blocker.

All shipped UI copy and repository documentation must be English. Preserve original-language transcripts and quotations. Keep the current graphite visual design and accessible Search/Explore interface.

## 2. Verified starting point: inspect before editing

The inspected checkout had these properties; recheck them rather than assuming they remain unchanged:

- React 19 / Vite 7 / strict TypeScript, Fastify 5, SQLite via better-sqlite3, npm workspaces. Existing dependencies already include sharp, Readability, TanStack Virtual, TanStack Query, Transformers.js and the MCP SDK. Preserve the lockfile; use `npm ci` after verifying the pinned Node runtime.
- `packages/core/src/pipeline.ts` only handles ordinary-page extraction. It explicitly blocks social acquisition and media analysis with `*_NOT_IMPLEMENTED` errors. Those truthful guards must be replaced only when real stage implementations exist.
- `apps/worker/src/index.ts` polls jobs and emits safe start/finish logs. Its in-process busy flag is not a cross-process singleton, durable resume mechanism or lease-renewal implementation.
- `packages/core/src/db.ts` already defines jobs, stage_results, assets, transcript_segments, evidence, analysis_revisions and search tables. Add numbered migrations; never recreate the user's database.
- `packages/core/src/diagnostics.ts`, `apps/web/src/ProcessingDetails.tsx` and `scripts/debug.mjs` supply useful diagnostics and a retry action. Extend these rather than deleting them.
- Provider Settings stores keys but makes no inference calls. The inspected local selected provider was Mistral. Preserve existing provider selection and keys; never print or read key contents into the agent conversation.
- `normalizeSource` uses overly broad hostname suffix checks; `importUrl` can merge unrelated web pages because it matches `platform='web'` with a null platform ID. Add failing regression cases before fixing both.
- URL validation does not yet enforce public DNS destinations on every connection. Ordinary-page fetching has an ineffective post-buffer size cap. File upload buffers the original for hashing and can leave duplicate/partial files behind. Repair these boundaries before enabling network/media processing.
- Keyword search uses LIKE despite an FTS schema. Embeddings are absent. The map takes the first 50 sources, ignores viewport bounds and reuses positions after every five items; it needs spatial pagination and stable positions.
- `ItemDetail` currently caps captures at 32, evidence at 80 and transcript segments at 500. Dense video processing must use paginated evidence endpoints, not silently truncate or inflate one response indefinitely.
- Settings processing pause is not wired into job acquisition. Player streaming/range handling, actual thumbnails and rich transcription/capture stages are missing.
- The shared strict Health schema no longer matches the diagnostic fields returned by `/api/health`; align versioned response schemas and add API contract tests. `registerLocalAsset` currently records a pending hash without copying/finalizing the asset; replace it with the verified streamed asset lifecycle, not another database-only registration.
- `scripts/test-live.mjs` and `scripts/benchmark.mjs` are placeholders. Existing Playwright configuration can reuse the real user server and expects demo data; isolate tests before expanding them.
- Previous tests passed for the shell and diagnostics. They are not media acceptance evidence.

The inspected machine is arm64 with 8 GiB RAM. Node on PATH was 24.15.0 although the project pins 22.23.2. Python 3.12, CMake and a third-party FFmpeg 8.0.1 executable were present; ffprobe, yt-dlp and whisper-cli were not found on PATH. Tool locations outside PATH may exist: inspect only relevant managed directories before installing. No Whisper accuracy or speed experiment has been performed yet.

The user supplied this live test source: `https://www.instagram.com/p/DbYQ0FXz-Ln/`. It played in Brave, while Keeptrail had zero downloaded assets and zero transcript segments. An older build had marked its HTML extraction as Ready. Do not convert that observation into a claim that anonymous yt-dlp acquisition works. Use the existing source on retry; preserve notes and tags.

## 3. Fixed tooling and installation

| Responsibility | Required choice |
| --- | --- |
| Node | Existing project pin 22.23.2, native arm64 |
| Social acquisition | yt-dlp 2026.8.19 in a private Python 3.12 venv, with `[default,curl-cffi]` extras |
| YouTube JavaScript | Existing pinned Node, explicitly passed to yt-dlp; packaged yt-dlp-ejs, no runtime remote-component downloads |
| Media inspection/extraction | Matched FFmpeg + ffprobe from the Homebrew `ffmpeg` formula; record the resolved formula version and binary paths once |
| Transcription | whisper.cpp v1.9.4, Metal, multilingual Small or Base selected by section 5 |
| Images | Existing sharp; JPEG analysis captures, WebP navigation thumbnails |
| Cloud gateway | Private packaged `omniroute@3.8.50`, loopback port 20129 |
| First provider path | Preserve saved Mistral selection; `mistral/mistral-small-latest` |
| Other existing provider paths | Explicit user selection only: Groq `groq/qwen/qwen3.6-27b`, OpenRouter `openrouter/openrouter/free`, Gemini `gemini/gemini-2.5-flash-lite` |
| Local semantic search | Existing Transformers.js 3.8.1, `Xenova/multilingual-e5-small`, revision `761b726dd34fb83930e26aab4e9ac3899aa1fa78`, q8 ONNX CPU |
| Queue/storage | Existing SQLite, separate Node worker, no Redis/Docker/server database |
| UI | Existing React, plain CSS, SVG map; TanStack Virtual for lists |

Use no new production JS package unless an already-required official integration needs it. Resolve Python transitive packages once, record exact versions/hashes in a tools lock manifest and reuse them. Do not auto-update yt-dlp during an import; an explicit maintenance command may update it only after tests and an updated lock manifest. A site's extractor can break independently of Keeptrail.

`setup` must idempotently provision required tools, initialize data and download verified model artifacts. Use a setup lock, private directories, temporary downloads, checksums and atomic rename. Whisper model weights come from the official linked distribution. For Small, the existing contract pins `ggml-small.bin`, 487601967 bytes, SHA-256 `1be3a9b2063867b937e64e2ec7483364a79917e157fa98c5d94b5c1fffea987b`; verify against upstream before installation. For Base, resolve the official file revision and LFS SHA-256, record them, then verify the downloaded bytes. Never invent a checksum or accept a partial model.

Compile whisper.cpp Release with Metal and four build jobs. Do not build OmniRoute's development frontend on this 8 GiB machine; install its production package in a private npm prefix. Do not modify any existing OmniRoute instance on 20128. Do not overwrite the existing global FFmpeg executable. If Homebrew is absent, finish independent work and report the installation prerequisite; do not substitute an arbitrary binary source.

## 4. Social acquisition and safe files

Implement modules under `packages/core/src/` for network policy, subprocess execution, media acquisition and asset lifecycle. Keep external-process invocation in argument arrays with `shell:false`; imported titles and URLs are data, never shell code.

For individual Instagram posts/Reels, TikTok videos, X video posts and YouTube/Shorts:

1. Parse exact platform host/subdomain boundaries and content IDs; normalize tracking parameters; reject profile, playlist and bulk imports. Short-link redirects must pass the same public-network checks. Deduplicate by platform + non-null content ID, otherwise canonical URL. Preserve distinct ordinary-page paths.
2. Attempt anonymous yt-dlp metadata acquisition. Use isolated configuration, JSON output, no playlist, bounded retries, at most 20 minutes duration and 500 MiB original media. Reject live streams and unsupported carousels/slideshows explicitly. For X multiple videos, create child video sources keyed by content ID and media index, under the saved parent; do not silently discard siblings.
3. Download to an item-owned staging directory using a generated UUID, 720p maximum, one fragment at a time. Pass the approved Node executable for EJS. Capture metadata needed for title, author, description, duration and evidence; never show raw metadata dumps in logs.
4. Use an enforcing loopback proxy for downloader egress, including HTTPS CONNECT. Resolve every destination, reject all non-public/reserved IPv4/IPv6 addresses and non-80/443 ports, and connect to the validated address without a second DNS lookup. Handle mapped IPv6. Reject mixed public/private DNS answers. No TLS interception. Use per-run proxy credentials, close with the owned job. Test the actual yt-dlp proxy path, redirects and manifest traffic; an ignored proxy is a failing security test.
5. Force native HTTP/HLS/DASH downloader paths. FFmpeg receives only verified local files and a file/pipe protocol allowlist, never remote manifests. Enforce cumulative downloaded bytes across fragments and separate audio/video streams, not only declared Content-Length or yt-dlp's optional metadata size. Time out metadata at 60 seconds and download at 15 minutes; count actual bytes and free disk. A failed limit check produces a typed user-facing error and cleans only owned temporary files.
6. ffprobe verifies actual media duration and streams before downstream work; account for rotation and timestamp offsets. Persist an asset only after successful validation, streamed hashing, fsync/rename and the corresponding database transaction. On restart reconcile finalized-but-unregistered assets and stale partials. Do not load a 500 MiB upload into Node memory.

Browser access is off by default. On a verified authentication failure, use `needs_browser_session` with explicit Brave/Chrome/Firefox selection, profile selection and a per-source opt-in retry. Add `brave` throughout API validation, UI and types. State that browser session extraction may require macOS Keychain approval. Never close the user's browser, extract unrelated profile data into logs, export all cookies to a file, bypass CAPTCHA/DRM/paywalls or treat browser login as evidence of download success. A rejected OS permission is a real blocker. Offer local-file import; it must use the same downstream stages.

For ordinary web pages, stream at most 5 MiB, validate DNS and each of at most five redirects, reject unsupported content types, and require nonempty readable text. Download failure is not Ready. Fix existing duplicate and partial upload cleanup without touching user-owned source files.

## 5. Local transcription experiment and deterministic choice

Run one media job at a time across all worker processes. One Whisper process, four transcription threads, no persistent loaded Whisper model while idle. Normalize a local audio file to mono 16 kHz PCM signed 16-bit WAV with FFmpeg using two threads. Run multilingual auto-detection, preserve source language, no translation and no cloud transcription.

Implement `npm run benchmark:whisper -- --input <local-file>` and benchmark Base and Small sequentially on the same representative 60–90 second sample from the supplied video once available. Use the same decoding parameters, a warm-up and three measured runs. Also use committed consented/public-license French and English speech fixtures with exact reference text and documented provenance; no arbitrary scraping. Record median real-time factor (wall seconds/audio seconds), peak aggregate owned-process RSS, model hashes and WER on the reference fixtures. A synthetic spoken reference can test mechanics, but must not be represented as real-world accuracy.

Selection rule, decided here: select Small if median real-time factor <= 2.0, measured owned-backend peak <= 3 GiB, and WER <= 20% on both reference fixtures. Otherwise select Base only if it meets those same thresholds. If neither passes, keep Small available as an explicitly slower/uncalibrated mode, record `BENCHMARK_TARGET_NOT_MET` and do not claim the hardware target passed. Do not substitute Tiny, Medium, Large, Turbo, faster-whisper, Core ML conversion or a different local engine. The old fixed-Small requirement is replaced only by this Small/Base rule. Thresholds are product acceptance choices, not published performance promises.

Use full JSON output from whisper-cli and test parsing against actual v1.9.4 JSON, including its timestamp units. Process long audio in sequential 60-second chunks with 1-second overlap; checkpoint each completed chunk, carry original offsets, and deterministically deduplicate overlap segments by timestamp/text. Verify clipping at video boundaries. Hard wall timeout 30 minutes per source. Pause/cancel terminates only owned child processes and preserves completed chunks. On Metal initialization failure, retry the same selected model once with GPU disabled and report CPU fallback; do not silently change model.

Silent videos skip transcription with a recorded `no_audio`/`no_speech` outcome and still proceed to visual analysis. Do not fabricate a transcript. A failed Whisper invocation is not a silent video.

## 6. Captures every 0.5 seconds: bounded context and explicit coverage

Extract candidate frames locally at 2 fps, timestamps `0, 500, 1000, ...` ms relative to media start. Bound to 2400 candidates for a 20-minute video. Normalize rotation, preserve aspect ratio, do not upscale, and record the original temporal mapping. Use FFmpeg's fps filter and test variable-frame-rate and rotated fixtures. Process in chunks rather than retaining all decoded frames in RAM.

The following are two explicit user-visible policies; do not confuse local sampling with cloud coverage:

- **Economical**, default: cloud-analyze at most 24 candidate frames per source. Divide the duration into 12 equal intervals; from each interval select its first available frame plus the frame with the greatest normalized grayscale difference from its predecessor. Force inclusion of the source's first and final candidate by replacing the nearest selected non-endpoint if necessary; deduplicate timestamps, retain at most 24, sort chronologically. Difference is mean absolute pixel difference on a 64x64 grayscale reduction divided by 255; ties prefer the earlier timestamp. No opaque AI frame selector. This heuristic can miss brief text: show “Selected frames analyzed”, sampled count and analyzed count.
- **Detailed (every 0.5 s)**: analyze every candidate in sequence. Exact duplicate pixels may reuse an analysis result but must retain all timestamp/evidence aliases. Do not remove frames merely because perceptual difference is small: a URL may change by one character. Before starting show sample count, estimated request count and current local daily allowance; disclose that completion can span days. Never claim full coverage while batches are pending.

Keep candidate JPEGs temporarily, longest edge <=1280, quality 82, at most 1 MiB per image; if oversized lower quality to 70 then 60, then longest edge 1024 and 768. If still too large, return an explicit image-limit error. Keep a 512 MiB per-source temporary-capture ceiling; pause with `STORAGE_LIMIT` before exceeding it, preserving completed work. After a source completes, discard unreferenced temporary candidates while retaining all captures used as evidence. Navigation thumbnails: WebP 320px longest edge, quality 70, at most 80 KiB. Lazy-load thumbnails; originals/captures are separate on-demand asset endpoints.

Cloud batches are chronological, bounded and restartable:

- Mistral: two new frames plus the final frame of the previous successful batch, maximum three images; first batch has only two. Text contains the relevant transcript excerpt and previous validated compact context, not the complete conversation.
- Groq Qwen 3.6: one new frame plus one previous frame, maximum two images. Its documentation permits five images but each costs 2048 input tokens and the documented free token allowance is 8000/minute; five images already exceed that allowance. Keep non-image request text conservatively bounded to 1500 UTF-8 bytes and max output 1024 tokens. Add a reservation margin and honor actual usage/headers. Do not equate the five-image API maximum with a usable free-plan batch size.
- OpenRouter Free and Gemini: use the same conservative one-new/one-previous policy. Validate the actual route's vision support with the setup test; if rejected, block that route instead of silently changing paid/free models.

Persist compact context after each successful batch: at most 400 characters describing the current visual topic and at most four already validated resource names with evidence IDs. Retain exact URL literals in their own evidence records; do not shorten or reconstruct them. Send only the context fitting the selected provider text budget. Mistral text input cap is 6000 UTF-8 bytes, output cap 1024 tokens; reduce context before source evidence. The provider has no assumed memory between calls.

Allow at most two additional crop-analysis calls per video when a validated batch result requests a region for unreadable small text. Crops must refer to an existing frame and normalized in-bounds coordinates; record their parent capture. No contact-sheet packing to evade image limits. No guarantee that OCR recovers a URL appearing for less than 0.5 seconds.

The coverage policy, frame planner version, frame hashes, timestamps, model and context hash are part of cache keys. Switching economical to detailed reuses compatible results but analyzes missing candidates; never silently label economical output detailed.

Reuse a duplicate-frame analysis only when its relevant transcript/context and model/prompt configuration also match. Identical pixels alone do not prove that spoken context is identical. Reused evidence must map to each actual occurrence rather than copying an unrelated timestamp.

## 7. OmniRoute and actual provider health

Implement a managed gateway adapter and supervisor, not a hardcoded “configured” flag. Use loopback `127.0.0.1:20129`, a private DATA_DIR, generated local secrets, no tray/browser UI, and production packaged execution. Reject an occupied unmanaged port without killing its process. Sanitize inherited environment to avoid accidentally reaching another gateway/provider account. Do not import a user's other OmniRoute configuration.

Use the pinned CLI setup and key-stdin interfaces, then a restricted local inference credential for the exact selected provider connection. Verify CLI/API response shapes against pinned source and executable help; write contract tests. `keys add <provider> --stdin` is verified upstream; consume its output privately. Never place provider secrets in CLI arguments, URLs, diagnostics, browser storage or agent messages. Use `JWT_SECRET`, `API_KEY_SECRET` and `INITIAL_PASSWORD` from private configuration, directories 0700/files 0600. Verify the local inference key is restricted to the actual connection UUID; do not treat a provider string as that UUID.

Call only the selected allowlisted model through `/v1/chat/completions`, nonstreaming, bounded output, no tools, no remote browsing. Disable cross-provider automatic fallback and prompt compression for evidence/URL payloads. Do not call the cloud vendor directly when OmniRoute fails. Mistral's `latest` name is an upstream alias: store both the requested alias and any actual returned model identifier, and do not claim the alias is immutable. OpenRouter Free may choose a different underlying free model; record that returned model and prohibit paid routes.

Implement Settings “Save and test”: save the selected key, start/check the managed gateway, run one text/JSON call and one known-image recognition call using a local nonprivate fixture. Only mark healthy after both pass structured validation. Distinguish saved key, gateway running, authentication accepted, text passed and vision passed. Count both tests against the local cap. Preserve the existing key when an empty replacement field is submitted; explicit removal clears only the selected provider.

Retain all four existing provider options. Validate Mistral first because it is currently selected; do not require another account. Groq and Gemini use free-account restrictions, not inherently zero-price model IDs. Explain the free-mode/billing-disabled acknowledgment and that the app cannot prove billing state from a key. Do not enable billing, rotate accounts, purchase credits or switch providers automatically. Quotas and provider availability are external limits; OmniRoute does not create free capacity.

## 8. Durable quota, queue and cancellation contract

Keep the existing local safety cap of 30 outbound inference attempts per UTC day, lowerable by the user. This is an application limit, not a provider promise. Persist an atomic reservation before every dispatch, including health tests, crops, repair attempts and retries. Maintain a separate successful-call count; never report attempts as successful calls. Use one global inference semaphore and at least 60 seconds between request starts, plus provider token/request limits when stricter. Reserve estimated tokens before sending; reconcile actual usage without erasing consumed requests.

On 429, persist a valid Retry-After (seconds or date), with bounded parsing, otherwise retry after 15 minutes, then 60 minutes, then manual pause. A wait beyond 24 hours becomes a manual pause displaying the server-provided delay, not an earlier retry. On 401/403 wait for credentials. On model-not-found/retired, explicit review, no silent replacement. On transient network/5xx retry after 30/120/600 seconds, still respecting the global minimum spacing. Save state on disk; no endless setInterval retry storm.

Build explicit durable stages:

`acquire → probe → audio → transcribe chunks → plan frames → analyze batches → synthesize → index → ready`

Local images start at image validation/frame analysis; ordinary pages start at readable-text extraction and text analysis. Silent videos skip audio/transcription only with a persisted reason. Web pages without a key remain locally searchable with analysis waiting; do not call local text extraction cloud synthesis.

Use SQLite transactional claims, lease owner, 60-second expiry and heartbeat renewal every 10 seconds while work is active, independently of long subprocesses. Enforce one heavy local media stage across workers with a database lock/lease. Lightweight read APIs remain responsive. Cloud-waiting jobs release resources so they do not block local ingestion of another source.

Each chunk/batch/stage has deterministic input hash, configuration/model/prompt version, verified output hashes, state and attempt count. Commit result and next-stage enqueue atomically. On crash, recover expired leases and verify stored outputs before skipping work. Retry means resume at the failed/missing stage, not re-download or create revision 1 again. Notes, tags, collections and confirmations survive reanalysis. New successful synthesis creates a new revision.

A crash after a provider received a request but before its result was committed cannot guarantee exactly-once remote inference without provider support. Record that attempt as outcome-unknown and conservatively counted; avoid immediate unbounded redispatch. Document and test this limitation honestly.

Completion invariant: `ready` requires all required stages in the persisted coverage plan to have validated successful outputs, and indexing to be complete. Explicitly recorded no-audio stages are valid skips. Missing tools, exhausted quota, pending batches and untested keys are not valid skips. Separate transcription-ready, local-searchable and cloud-analysis-ready capabilities in the UI so a partially useful source remains accessible without being labeled fully processed.

Wire global and per-item pause/resume/cancel APIs into actual claims. Pause waits for a current bounded cloud call or stops an owned local subprocess safely; retain completed checkpoints. Cancel kills only verified owned process groups, escalates TERM to KILL after five seconds and clears only owned partials. Resume restarts only unfinished chunks/stages. Clean supervisor shutdown closes database/processes once.

Add validated `POST /api/items/:id/pause`, `/resume`, `/cancel`, retaining `/retry`; `PATCH /api/settings` controls the global pause. Add paginated `GET /api/items/:id/jobs`, `/transcript`, `/captures`, `/evidence`, and include stable next cursors in bounded responses. Unknown IDs return 404, conflicting state transitions 409, malformed inputs 400. Mutations enforce the local session/CSRF boundary. UI buttons expose only valid transitions and explain waiting states.

## 9. Validated analysis, evidence and search

Define strict Zod schemas and versioned prompts. Per-batch output contains short visual observations, resource names, literal URLs if readable, evidence IDs and optional crop requests. All strings/counts/regions are bounded. Unknown keys, invented evidence IDs, foreign-item citations and out-of-bounds timestamps/regions fail validation. Imported content is untrusted source material, never instructions.

A final synthesis consumes validated observations plus transcript/page chunks. Produce a title, <=600-character summary, <=8 evidenced key points, <=3 existing topic IDs, <=8 normalized tags and <=20 website mentions. Long transcripts are chunked into bounded text-analysis calls, each separately cached and quota-counted; final synthesis uses the validated partial outputs. Do not silently omit later transcript chunks. Persist overflow mentions for paginated access if a source genuinely contains more than 20.

One structured-output repair attempt maximum per source revision, counted against quota. If invalid again, needs_review. JSON syntax success is not schema/evidence validation. A spoken website name does not authorize inventing its domain. A URL visually read by the model remains “Needs checking”; retain exact capture and timestamp. Literal URLs from transcript/page evidence must actually occur there. Do not visit model-suggested sites. Never hide incomplete analysis behind an empty successful summary.

Use paginated endpoints for transcripts, captures and evidence with stable cursor ordering. Existing detail endpoints return a bounded preview plus explicit totals/cursors. Timestamp clicks open the local player at the matching time or the relevant capture when no playable original remains.

Implement local E5 q8 embeddings in a single child process with two CPU threads, one small batch at a time, unload after 60 idle seconds and do not run concurrently with Whisper. Query prefix `query: `, passage prefix `passage: `, mean pooling and L2 normalization, 384 dimensions, maximum model input 512 tokens. Use passage chunks of <=384 tokens with 64-token overlap. Model artifact revision must remain pinned and cached locally.

Maintain FTS5 insert/update/delete synchronization; test it. Keyword retrieval top 50 plus cosine top 50, reciprocal-rank fusion with k=60, deduplicate by item, deterministic tie-break by ID. Apply user filters before returning results. If embeddings are unavailable, expose keyword mode explicitly. Paginate the library and use TanStack Virtual for long lists; “Load more” must advance its cursor rather than reload page one.

## 10. Map, images and player

Keep SVG; do not introduce a force simulation, WebGL engine or diagram framework. Persist stable world coordinates by ID and topic lane. Topic lane y=120+120*displayOrder; source positions have distinct x values within each lane, without modulo-five overlap. Shared websites use one node each.

Map endpoint accepts viewport world bounds, zoom and cursor. Use indexed coarse spatial cells and stable ID ordering to query candidates, then exact rectangle intersection. Do not rebuild/load the full graph during each pan. Zoom <0.8 shows topic groups with counts; 0.8–1.2 shows source nodes; >1.2 shows source thumbnail cards. Fetch and render only visible nodes plus a 200-world-unit overscan, at most 80 nodes and 120 edges. If exceeded, return counted groups and `hasMore`/cursor; do not silently drop sources. Edges reference present endpoints. Preserve selection and provide a paginated keyboard/list alternative.

No video element in the map/list and no iframe embeds. One detail player is created only when the user presses Play or a timestamp. Use HTML video controls, `preload="none"`, no autoplay attribute, and a thumbnail poster. Remove/pause its source on close or item change. Serve local media with authenticated single-byte-range support (206, Content-Range, Accept-Ranges; 416 for invalid ranges); no full-file buffer. Transcode incompatible local codecs to a bounded local H.264/AAC playback proxy with two FFmpeg threads, on demand, and cache it. Show a clear processing state while preparing playback.

Keep full-size images out of navigation. Fetch thumbnails only while visible, with known dimensions to avoid layout shift; open originals on explicit click. Test that no original-video request occurs while merely panning the map.

## 11. Diagnostics, migration and verification gates

Extend `npm run debug` with real tool versions, capability health, current stage/checkpoint, sanitized error code, quota remaining, next attempt, estimated cloud requests, sampled/analyzed frame counts, worker lease age and processing revision. Use request IDs/job IDs and bounded structured event history. No keys, cookies, transcript bodies, captures, imported URL query strings or raw upstream payloads. Add read-only `get_processing_status` and `get_capabilities` MCP tools without exposing credentials or arbitrary paths.

Introduce explicit `is_demo` metadata for fixtures. Never let demo content count as live acceptance. Migrate only demonstrated false-success social records from older `local-readability` revisions to a review state; keep old evidence as legacy, preserve user edits, and schedule actual processing only through explicit retry. Do not erase unrelated source records.

First create an implementation checklist and acceptance matrix with file ownership. Then implement in this order, verifying each before moving on:

1. Regression tests for normalization, distinct web URLs, migrations, bounded upload and network policy.
2. Tool setup/doctor and safe subprocess/asset lifecycle.
3. Durable stages/leases, restart, pause/resume/cancel.
4. Actual download, probe, Whisper benchmark/selection, transcript chunks and frame planning.
5. Isolated OmniRoute setup, save-and-test, quotas, structured batches and evidence synthesis.
6. Semantic search, bounded data APIs, thumbnails/player and viewport-aware map.
7. End-to-end verification, actual diagnostics and corrected documentation.

Mandatory automated tests use isolated temporary data directories and a separate test port. Do not reuse the user's running Keeptrail instance or settings. Include:

- Four platform URL parsers, fake suffix hosts, private IPv4/IPv6/mapped addresses, mixed DNS answers, blocked redirects, a real downloader request through the enforcing proxy, hostile titles and truncated uploads.
- Two competing workers, one active heavy job; expired-lease recovery; stop/restart between batches; pause/resume; cancel subprocess; notes preserved; no replay of completed local steps; simulated ambiguous remote result.
- Synthetic video showing a known URL for one second without speaking it; a changed single-character URL; spoken resource name with no domain; silent video; rotated and variable-frame-rate video. Detailed mode must retain every planned timestamp; economical mode must report reduced coverage. Use a mock gateway for deterministic inference, explicitly labeled as mocked.
- Actual Whisper JSON fixture parsing and the real local model benchmark; no invented measurements.
- Gateway setup integration in disposable private state; mocked 401, 403, 429, 5xx, schema violation, invented evidence ID, oversized payload, token cap and daily reset across restart. No credential needed for deterministic tests.
- E5 model actually loaded for French/English semantic fixture retrieval, relevant source in top five; separate ranking-unit tests. Distinguish real embeddings from mocked vectors.
- Playwright on 1440x900 and 1280x800: import, wait, evidence, editing, pause/resume, retry, search/filter, map pan/zoom, selection, player timestamp seeking and a safe debug report. Check reduced motion, keyboard paths and accessibility. Assert zero media downloads on map pan and bounded DOM nodes on 1000 synthetic items.
- Asset range responses, path/symlink escape rejection, Host/Origin enforcement, CSRF/session boundary, diagnostic redaction and read-only MCP authorization. Existing MCP directly opens the database and migrates it; refactor to the authenticated read-only API described in the older contract rather than calling a mutating open routine from retrieval tools.

Replace `test:live` and `benchmark` placeholders with real commands that fail clearly when prerequisites are absent. Live gate: use the supplied Instagram URL with the saved selected provider only under the user's configured cloud/session consent. Do not invent live URLs for other platforms. Test their adapter fixtures and report live Instagram/YouTube/TikTok/X independently; ask for additional user-selected URLs only when required for those live gates. A login or unavailable quota must not prevent completion of unrelated local implementation and deterministic tests.

Run lint, typecheck, unit/integration tests, production build and isolated E2E. Benchmark 1000 metadata sources/5000 chunks/100 captures; report owned-backend peak RSS, warm search p95, pan/zoom responsiveness and actual transcription real-time factor. Target <=3 GiB owned backend peak, warm search p95 <=500 ms, responsive API during media processing; measure, do not promise. If a target fails, optimize within this architecture and publish the remaining measured gap.

Do not mark the project complete with mocked inference alone, a saved key alone, source HTML instead of video, empty fabricated outputs or “implemented” diagnostics constants. Distinguish implemented, deterministic-test verified, live verified, blocked externally and not yet implemented for each stage. Deliver changed-file summary, exact start command, test evidence, measured benchmark, and specific remaining external blockers. Continue coding while safe required implementation remains.

## 12. Official references checked for this contract

These sources establish tool capabilities, not Keeptrail's live reliability. Product budgets, selection thresholds, frame policy and architecture above are deliberate engineering decisions.

- [yt-dlp upstream](https://github.com/yt-dlp/yt-dlp) and [PyPI package metadata](https://pypi.org/pypi/yt-dlp/json): installer, extractor CLI and current 2026.8.19 package pin.
- [yt-dlp EJS](https://github.com/yt-dlp/yt-dlp/wiki/EJS): external JS runtime/EJS requirements, Node support.
- [yt-dlp cookies FAQ](https://github.com/yt-dlp/yt-dlp/wiki/FAQ): browser sessions and the risks of exporting all cookies.
- [whisper.cpp](https://github.com/ggml-org/whisper.cpp) and [v1.9.4](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.4): Apple Silicon/Metal and multilingual model tooling. Published memory estimates are not local benchmarks.
- [FFmpeg filters source](https://github.com/FFmpeg/FFmpeg/blob/master/doc/filters.texi): fps sampling semantics; [FFmpeg CLI](https://ffmpeg.org/ffmpeg.html).
- [OmniRoute v3.8.50](https://github.com/diegosouzapw/OmniRoute/releases/tag/v3.8.50), [key CLI](https://github.com/diegosouzapw/OmniRoute/blob/v3.8.50/bin/cli/commands/keys.mjs), [Mistral registry](https://github.com/diegosouzapw/OmniRoute/blob/v3.8.50/open-sse/config/providers/registry/mistral/index.ts), [Groq registry](https://github.com/diegosouzapw/OmniRoute/blob/v3.8.50/open-sse/config/providers/registry/groq/index.ts): exact package and route identifiers.
- [Groq vision](https://console.groq.com/docs/vision) and [Groq rate limits](https://console.groq.com/docs/rate-limits): image token cost and free-plan constraints.
- [Mistral vision](https://docs.mistral.ai/studio/conversations/vision), [known limitations](https://docs.mistral.ai/resources/known-limitations), [key setup](https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key), [rate limits](https://help.mistral.ai/en/articles/698531-why-am-i-hitting-api-rate-limits-and-how-do-i-increase-them): vision support, free mode and account-dependent quotas.
- [OpenRouter free variants](https://openrouter.ai/docs/guides/routing/model-variants/free) and [FAQ](https://openrouter.ai/docs/faq): limited free capacity, not an unlimited production promise.
- [Xenova E5](https://huggingface.co/Xenova/multilingual-e5-small): Transformers.js usage and model artifacts; the prescribed revision was separately checked in the model API.
- [TanStack Virtual](https://tanstack.com/virtual/latest/docs/introduction) and [MDN video](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video): list windowing and explicit media loading/playback controls.
