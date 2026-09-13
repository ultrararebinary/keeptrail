# Implementation status

Reviewed 2026-09-13. **REQUEST CHANGES — not ready for release or merge.**

Real integrations exist, but passing compilation and 23 unit tests do not establish a working end-to-end pipeline. The previous delivery report overstated acceptance. Internal defects must be separated from external provider/platform limits. See [CODE_REVIEW.md](CODE_REVIEW.md).

| Area | Current evidence | Remaining gate |
| --- | --- | --- |
| Build and regression suite | 9 files / 23 tests, strict lint, typecheck and four builds passed again | Broad contract acceptance is not covered |
| Acquisition | Real yt-dlp and loopback proxy code | The one-download limit produces exit 101, rejected by the wrapper; browser cookies/native-downloader policy is not wired |
| Network safety | DNS pinning and bounded page reads exist | IPv6 mapped/expanded loopback bypasses classification; media protocol allowlists are absent |
| Queue and restart | SQLite jobs and renewable job leases exist | Heavy lock is not renewed; stage completion is not atomic with successor creation; active pause/cancel and chunk recovery are incomplete |
| Whisper/tool provisioning | Installer and historical silence-only benchmark exist | Default worker does not consume installed model/executable paths; representative WER and aggregate-memory acceptance missing |
| Frames | 2 fps extraction and economical planner exist | Storage cap is checked after extraction; all planned images are loaded into memory; thumbnail/crop/cache pipeline incomplete |
| Cloud analysis | Managed gateway, restricted-key setup, schemas and reservations exist | Live health unverified; retry scheduling, evidence prompts, context truncation and credential replacement need correction |
| Indexing/search | FTS keyword lookup and embedding/RRF helpers exist | Video index stage does not index transcripts; semantic ranking is not called; embedding child lifecycle absent |
| UI/map/media | Virtualized list, detail controls, explicit video load and range handler exist | Import-to-result, detail pagination, world-viewport map, thumbnail generation and codec fallback not accepted |
| MCP | Six stdio tools using read-only SQLite | Not the contracted authenticated API; protocol acceptance missing |
| Test infrastructure | Deterministic tests pass | Playwright reuses port 4317 and expects existing demos; no committed GitHub Actions workflow |

## Review environment facts

- Read-only checks identify **Apple M1, 8 GiB RAM**. Target hardware is available; the representative workload has not been measured.
- Metadata-only checks find Mistral selected, its configured flag set and its key file present. No key value was read or printed. Presence is not validity or provider health.
- The earlier Instagram exit 101 is not proof of an external denial: an offline invocation of installed yt-dlp reproduces it with the one-download limit. Revalidate after fixing acquisition.
- Other social platforms, cloud inference, reference-speech WER and the performance corpus remain unverified.

This review changes documentation, not application behavior. Preserve this implementation as a review snapshot; resolve the security/pipeline findings and add regression tests before merging.
