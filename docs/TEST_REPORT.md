# Verification report

Review date: 2026-09-13. Verdict: **REQUEST CHANGES**. See [CODE_REVIEW.md](CODE_REVIEW.md).

## Fresh checks

Commands used Node 22.23.2 selected by `scripts/keeptrail`.

| Check | Result |
| --- | --- |
| `./scripts/keeptrail test` | PASS — 9 files, 23 tests |
| `./scripts/keeptrail run lint` | PASS — zero warnings allowed |
| `./scripts/keeptrail run build` | PASS — typecheck and web/API/worker/MCP builds |
| `npm audit --json` under pinned runtime | FAIL — 9 findings: 1 low, 2 moderate, 5 high, 1 critical |
| `npm audit --omit=dev --json` | FAIL — 5 findings: 1 low, 1 moderate, 3 high |
| Hardware metadata | Apple M1, 8,589,934,592 bytes RAM |
| Credential metadata, read-only | Mistral selected; configured flag and key file present; secret value not read |

Audit counts include transitive findings and do not alone prove exploitability here. No forced upgrades were applied. The duplicate native sharp/libvips warning persists. One independent reviewer ran tests under global Node 24 and encountered a SQLite ABI mismatch; the leader's fresh pinned-Node run above is the authoritative unit-test result.

## Diagnostic reproductions

These were review experiments, not newly committed regression tests. Database probes used generated temporary directories, subsequently removed. No user records were modified; remote embedding downloads were disabled for the page probe.

| Probe | Observed result |
| --- | --- |
| Claim heavy job A at t=0; renew its job lease at t=50s; claim B at t=61s | B claimed while A remains running: heavy exclusion fails |
| Process valid synthetic readable HTML | Worker returns completed, job becomes done, item remains downloading |
| Insert a transcript containing a unique term; process index without cloud health; search the term | 0 matches; transcript not indexed |
| Installed yt-dlp with offline supplied metadata and `--simulate --max-downloads 1` | Exit 101, without contacting Instagram |
| Public-address classification | Hex-mapped private IPv4 and expanded IPv6 loopback accepted; destination resolver also accepts mocked mapped-loopback DNS |

The passing unit suite does not exercise these successful-processing/concurrent-worker paths.

## Earlier agent-reported evidence — not rerun in this review

- Setup/doctor reportedly detected FFmpeg/ffprobe 9.0.1, yt-dlp 2026.08.19, Whisper.cpp v1.9.4, Small/Base hashes and OmniRoute 3.8.50. Presence does not prove runtime wiring.
- Two Playwright shell scenarios reportedly passed at 1440×900 and 1280×800. The committed configuration uses `reuseExistingServer: true`, port 4317, and no isolated fixture initialization. It was deliberately not rerun against the user's library. These are not import-to-analysis acceptance tests.
- Disposable OmniRoute restricted-credential provisioning reportedly passed; no provider inference pass was established.
- The supplied Instagram URL reached metadata then returned exit 101. This is an unresolved implementation issue, not a proven external denial.
- Small/Base warmup plus three runs used generated 60-second silence. [WHISPER_BENCHMARK.md](WHISPER_BENCHMARK.md) retains these historical measurements, not a speech-quality pass.

## Unverified acceptance

No fresh install, live inference/download, representative English/French WER, aggregate backend RSS, 1,000-source/5,000-chunk benchmark, real E5 retrieval, MCP protocol session, 500 MiB upload, accessibility audit or isolated processing E2E pass is claimed. No GitHub Actions workflow is committed. The M1/8 GiB hardware exists; workload measurements are missing.
