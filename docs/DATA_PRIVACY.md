# Data and privacy boundary

Keeptrail is local-first by default.

**Security review warning (2026-09-13):** the intended boundaries below are not a security certification. IPv6 destination filtering, ambient downloader configuration, media protocol restrictions and real-path asset checks have open findings in [CODE_REVIEW.md](CODE_REVIEW.md). Avoid untrusted URLs/media until corrected; do not expose the service beyond loopback.

## Stays on this Mac

- SQLite metadata, notes, tags, collections, transcripts, captures, and search chunks.
- Original imported files until the user explicitly deletes them.
- Local page parsing, FFmpeg normalization/frame extraction, and Whisper.cpp transcription.
- The selected provider key, stored as `config/groq.key`, `config/openrouter.key`, `config/mistral.key`, or `config/gemini.key` with filesystem mode 0600 when configured.

The server never returns the key value and does not place it in SQLite, browser storage, logs, exports, or URLs.

## Leaves this Mac only after opt-in

Selected transcript text and captures may be sent through the configured private loopback OmniRoute gateway to Groq, OpenRouter Free, Mistral Free, or Google Gemini for analysis. The worker never calls a vendor directly and never silently falls back to another provider or a paid model. Settings performs text and known-image health calls before enabling cloud analysis; those two calls consume two daily quota slots.

## User controls

- Notes and tags are editable and persist locally.
- JSON export is available per source.
- Original local files can be deleted after successful processing while notes, transcripts, captures, and search rows remain.
- Browser-session preferences exist but are not wired to the downloader. Moreover, yt-dlp does not yet ignore ambient configuration, so the current code cannot guarantee the intended explicit-only cookie policy.
- There is no analytics, telemetry, sharing, or automatic upload.

## Limits and residual risk

Local filesystem permissions are the primary protection for the local library. Anyone with access to the macOS account or data directory can read it. The app does not claim end-to-end encryption. Provider retention and quota behavior are governed by the selected provider's current terms. Live success still depends on the installed pinned tools, provider credentials, source access, and available free quota.
