# Debugging Keeptrail

Start the current build with `npm run build` then `npm start`. After code changes, restart both API and worker; rebuilding alone does not reload either process.

## Current processing boundary

Review 2026-09-13 supersedes the delivery claims below: [CODE_REVIEW.md](CODE_REVIEW.md) records internal defects in acquisition, IPv6 filtering, lock renewal, pause/cancel, page completion and indexing. Stage names and diagnostics are inspection surfaces, not proof of acceptance. In particular, exit 101 can be caused by the application's yt-dlp one-download option; do not automatically label it an Instagram permission failure.

The video code contains acquisition, probe/audio, transcription, frame planning, an index-labelled stage, cloud batches and synthesis. The index-labelled stage does not actually index transcripts; synthesis indexes only its reduced output. Ordinary pages extract readable text but currently leave the item downloading after marking the job done. Pause/cancel during active work and durable per-chunk recovery are not implemented end-to-end.

The social path uses the pinned yt-dlp executable through an authenticated local proxy with public-DNS and redirect checks. A video that plays in Brave is not automatically downloadable by the worker: platform permissions, login requirements, rate limits, and upstream changes remain external blockers. X multi-video posts expand into child sources; other unsupported carousels are retained as `needs_review`.

Older builds incorrectly marked social HTML shells as Ready. Per-source diagnostics identify those records as `LEGACY_FALSE_SUCCESS`. Retry processing preserves notes and tags and reevaluates the source with the current worker.

## Agent inspection

- `npm run debug`: app capabilities, selected provider ID/key-present boolean, worker heartbeat and job counts.
- `npm run debug -- <source-uuid>`: item state, error code, bounded recent job history and counts of stored outputs.
- `GET /api/diagnostics` and `GET /api/items/:id/diagnostics` expose the same reports on loopback.
- Open a source → Processing → Technical details → Open safe debug report. Settings also links to the app report.
- `POST /api/items/:id/retry` queues a fresh attempt. An existing queued/running job returns 409; unknown items return 404. Notes, tags and existing evidence are preserved.

Reports deliberately exclude credentials, cookies, URLs, titles, notes, transcripts, filesystem paths and raw error messages. Do not add full settings dumps, environment dumps, provider payloads or request bodies. Request IDs are returned as `x-request-id`; frontend API errors include that ID for correlation with server logs. Worker logs emit `job.started` and `job.finished` with source/job IDs, stage and result, without source content. Tool versions, checkpoint counts, frame coverage, quota allowance, next attempt, lease age, and a sanitized error code are safe diagnostic fields.

Use temporary `KEEPTRAIL_DATA_DIR` directories for tests and the pinned `scripts/keeptrail` wrapper for Node. Unit tests cover false Instagram success, empty HTML, misleading key state, duplicate retries and diagnostic privacy, but not the complete pipeline. Do not run the current Playwright configuration against the user's live library: it reuses the standard port and assumes demo records. Isolate it first.

The earlier Brave reproduction found a playable Instagram source while Keeptrail reported Ready with zero transcript segments and only page evidence. This verifies the false-success regression; it does not validate an operational video pipeline. Use `npm run test:live -- --instagram <user-selected-url>` for an explicit external check and report a missing yt-dlp, login challenge, quota response, or source change as a blocker.
