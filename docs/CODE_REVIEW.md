# Pipeline implementation review

Date: 2026-09-13. Scope: uncommitted implementation and documentation relative to `0d13635`; latest LUNA contract.

**Final verdict: REQUEST CHANGES. Architectural status: BLOCK.** Independent code/security and architecture reviews agree. This snapshot may be preserved on a review branch, but must not be merged or released as an accepted implementation. This review updates documentation only; the defects below remain in application code.

## Confirmed findings

Severity P1 means high-priority correctness/security or a core acceptance blocker; P2 means important but lower-priority boundedness/coverage work. Recommendations are implementation tasks, not fixes performed by this review.

### R1 — P1: private destinations bypass IPv6 classification

[network.ts:47](../packages/core/src/network.ts#L47) normalizes only dotted IPv4-mapped addresses and compares IPv6 text prefixes. Hex-mapped private IPv4 and expanded loopback pass. In an offline probe, `isPublicAddress` returned true for hex-mapped loopback/private and fully expanded loopback; `resolvePublicDestination` accepted a mocked DNS answer pointing to mapped loopback. DNS pinning then pins an unsafe destination.

Canonicalize addresses to bytes and apply complete public-address policy, including mapped IPv4 and special-use ranges. Regression: equivalent compressed/expanded/mapped forms, mixed DNS, and actual proxy HTTP/CONNECT rejection. Avoid untrusted URL/media processing until corrected.

### R2 — P1: successful yt-dlp limit stops become download failures

[acquisition.ts:65](../packages/core/src/acquisition.ts#L65) passes `--max-downloads 1`. Installed yt-dlp raises `MaxDownloadsReached` after the first completed output and maps it to exit 101. [media.ts:62](../packages/core/src/media.ts#L62) rejects nonzero exits, before acquisition parses the result or finalizes the file.

An offline installed-CLI probe with supplied metadata and `--simulate --max-downloads 1` returned 101. This explains a deterministic false-failure path; it does not prove the earlier Instagram file completed, because that artifact was not inspected. The earlier report must not classify 101 as an external Instagram denial.

Remove the unconditional limit-stop failure, preserving single-item metadata validation and output ownership. Do not simply accept every 101. Regression: successful single-output finalization and real errors; then retest the supplied source.

### R3 — P1: downloader/media isolation and byte limits are incomplete

[acquisition.ts:50](../packages/core/src/acquisition.ts#L50) and line 65 omit `--ignore-config` and explicit native HTTP/HLS/DASH downloader constraints. User/global yt-dlp configuration can enable browser-cookie extraction or other behavior outside the intended opt-in policy. Browser-session settings saved by the app are never passed to acquisition.

[media.ts:87](../packages/core/src/media.ts#L87) and its FFmpeg invocations lack the contracted file/pipe protocol whitelist. A local input path alone does not constrain network references inside media manifests. There is no cumulative transfer counter: max-filesize and final stat do not bound separate streams/fragments before disk consumption. Frame storage is checked only after FFmpeg has emitted the candidate set.

Ignore ambient downloader configuration, enforce native downloaders and local-only media protocols, count cumulative bytes while transferring, stop owned processes at limits and clean staging. Tests must exercise the real downloader/proxy boundary, unknown lengths, fragments and malicious manifests. The symlink path guard is also only lexical: validate regular-file/real-path ownership before asset streaming.

### R4 — P1: heavy-work singleton expires while work still runs

[pipeline.ts:49](../packages/core/src/pipeline.ts#L49) creates a 60-second heavy lock; [renewLease at line 64](../packages/core/src/pipeline.ts#L64) renews only the job. The lock expires during transcription/extraction. Reproduction: claim A at t=0, renew at t=50s, claim B at t=61s; B is accepted while A remains running.

Renew lock and job together with matching ownership/fencing. Test two real DB connections/workers over expiry and process death. A one-job-at-a-time loop within one process is insufficient.

### R5 — P1: pause/cancel and checkpoint guarantees are not implemented end-to-end

[worker:21](../apps/worker/src/index.ts#L21) passes no AbortSignal; [pipeline:310](../packages/core/src/pipeline.ts#L310) checks flags only before a stage. Requests made during a stage do not interrupt subprocesses, and later status writes can overwrite paused/canceled items.

Successor insertion via `enqueueStage` and current-job completion via `finishStageJob` are separate transactions (for example [pipeline:325](../packages/core/src/pipeline.ts#L325)). A crash between them leaves a successor plus a recoverable running predecessor, permitting repeated work. Whisper chunks are accumulated in memory and their JSON removed in [media.ts](../packages/core/src/media.ts); restarting retranscribes completed chunks. Persisted stage results are not used as verified input-keyed restart caches.

Use owned cancellation control, atomic stage completion/successor creation, lease fencing and verified per-chunk/batch checkpoints. Regression: pause/cancel during each subprocess, crash at commit boundaries, restart without redoing successful work or duplicating remote attempts.

### R6 — P1: default worker does not use provisioned Whisper paths

[setup.mjs:108](../scripts/setup.mjs#L108) installs Whisper below `.tools/whisper.cpp` and models below `.tools/models`, recording paths in a lock. [pipeline:353](../packages/core/src/pipeline.ts#L353) instead defaults to `whisper-cli` on PATH and a model under the user data directory. Startup does not load the tools lock into these settings. FFmpeg/ffprobe similarly use PATH defaults rather than consistently using the provisioned pair.

Load and validate the tool manifest in the runtime startup path. Regression: a clean isolated data directory and no global Whisper installation must process a local fixture using the installed private binaries/models. Doctor presence checks are not enough.

### R7 — P1: local transcript indexing and semantic retrieval are missing

The `index` stage at [pipeline:378](../packages/core/src/pipeline.ts#L378) checks cloud health and enqueues cloud analysis without indexing transcript rows. It can say “Local indexing is complete” without writing those chunks. A seeded transcript term produced zero search results after this stage without a key.

[search.ts](../packages/core/src/search.ts) defines semantic ranking/RRF helpers, but [library.ts:45](../packages/core/src/library.ts#L45) only queries keyword candidates, sorts results by creation time and always returns keyword mode. Embeddings run in the importing process, not a bounded singleton child, and input is sliced rather than token-chunked.

Implement local transcript/evidence indexing independently of cloud health, wire filtered hybrid retrieval and bounded embedding lifecycle. Test French/English real-E5 top-five retrieval, keyword fallback, long transcripts, and filter/rank/pagination behavior.

### R8 — P1: successful ordinary pages remain permanently downloading

[processReadablePage](../packages/core/src/pipeline.ts#L275) sets metadata and cloud status, then marks the job done without updating item status or scheduling cloud continuation. Synthetic valid HTML reproduced: worker completed, job done, item downloading.

Persist an explicit locally usable/cloud-waiting outcome and a resumable cloud path. Test successful pages, not just empty/error pages, with and without tested credentials.

### R9 — P1: synthesis loses user tags and can assert unsupported evidence

[pipeline:250](../packages/core/src/pipeline.ts#L250) deletes all item tags before applying model tags, including manual edits. At line 260 any returned literal URL becomes confirmed, without checking it against an extracted literal-URL registry. Batch prompts supply capture IDs, while validation expects evidence IDs; synthesis supplies transcript text without its evidence IDs. Strict output schemas are not described completely in the model prompts, and repair/crop execution is not wired.

Analysis takes only the first transcript segments; synthesis truncates transcript and serialized batch outputs at [pipeline:225](../packages/core/src/pipeline.ts#L225), potentially cutting JSON and omitting late evidence. “Ready” therefore does not establish complete coverage.

Separate user-owned metadata from inferred metadata; supply explicit schemas/evidence IDs, preserve all bounded evidence through hierarchical reduction, validate literal URLs against source evidence, and retain OCR uncertainty. Regression: manual tags survive reanalysis, late-video facts survive synthesis, and fabricated URLs/foreign citations cannot become confirmed.

### R10 — P1: quota failures and retry attempts are misclassified

[analysis.ts:65](../packages/core/src/analysis.ts#L65) throws plain errors for local quota denials. [pipeline:206](../packages/core/src/pipeline.ts#L206) treats every non-gateway error as a transient network failure and always calls `retryDelayMs(1, ...)`. This turns daily-cap/spacing/schema failures into 30-second gateway retries and prevents progressing to terminal retry limits. The reservation still prevents exceeding the daily cap; the defect is scheduling, classification and endless retry behavior.

[quota.ts](../packages/core/src/quota.ts) clamps Retry-After above 24 hours instead of requiring manual action, and health reservations bypass global spacing/concurrency. Synthesis lacks the same durable transient retry path.

Use typed retry outcomes with persisted attempt counters/retryAt, global single-flight spacing for all calls, and terminal/manual states. Test restart, health plus inference overlap, malformed output, daily caps, 429 over 24h, and exhausted 5xx retries.

### R11 — P2: bounded map, thumbnails and detail pagination are incomplete

[graph at library.ts:147](../packages/core/src/library.ts#L147) selects 50 items before filtering by viewport. The UI does not traverse graph cursors into a world index or implement the specified zoom-level groups/cards. Panning cannot retrieve arbitrary world-visible items beyond the selected page.

The first full capture is used as thumbnail rather than a dedicated 320px asset. Both frame persistence and batch analysis load all selected frames as base64 before choosing a small batch. Item detail still loads all evidence/captures and limits transcript to 500; the UI does not use the new paginated detail endpoints.

Implement indexed viewport selection, zoom-level rendering, separate small thumbnails and UI-consumed pagination. Load only current/prior batch images. Test the large fixture corpus and media-request/memory bounds, including detailed coverage.

### R12 — P2: existing test evidence does not cover acceptance

[playwright.config.ts:16](../playwright.config.ts#L16) reuses a server on the user's standard port without an isolated fixture directory. Both browser tests traverse the same demo shell; neither tests real import, editing/search correctness, pipeline recovery, media/network bounds or provider routing. The 23 unit tests lack corresponding integration suites; there is no committed CI workflow.

Use disposable data and ports, explicit seed/setup, no server reuse, and targeted regressions above. Add the full contract gates incrementally. Do not call a passing shell smoke test “UI complete.”

## Additional handoff cautions

- Provider health checks accept any nonempty string in a vision JSON response rather than checking recognition of known fixture content. `OmniRouteClient.chat` records the returned model without verifying the approved model/alias, and reads response JSON without a byte cap. Restricted-key provisioning is useful but does not prove these separate runtime checks; add wrong-image, wrong-model and oversized-response regressions.
- `ensureManagedGateway` returns an already-running provider connection without comparing the newly saved key. Credential replacement must reconfigure the connection and invalidate prior health; blank API key handling currently deletes the saved file rather than preserving it.
- MCP uses read-only SQLite rather than the contracted authenticated local API. Its documented arguments/outputs must match the six actual tool schemas.
- Default source deletion and unsupported-codec playback still need acceptance coverage. No release should rely on advertised controls without exercising them.
- Audit reports 9 total dependency findings, including a critical development dependency; production-only audit reports 5, including 3 high. Triage actual exposure and compatible upgrades separately, not with force-fix.
- Actual hardware is M1/8 GiB, and Mistral credential metadata is present. The missing checks are representative workload and live provider validation, not absent hardware/key.

## Verification and publication

See [TEST_REPORT.md](TEST_REPORT.md) for fresh passing build/unit checks, failing diagnostic probes and historical-only claims. The review made no live cloud call or new social download and did not alter private settings.

Publish only as an explicitly unapproved review snapshot. No automatic merge, release tag, deployment, or claim of complete contract execution. Next implementation pass: security/acquisition → runtime/queue → evidence/indexing → bounded UI → isolated acceptance.
