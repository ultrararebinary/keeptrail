# Data and privacy boundary

Keeptrail is local-first by default.

## Stays on this Mac

- SQLite metadata, notes, tags, collections, transcripts, captures, and search chunks.
- Original imported files until the user explicitly deletes them.
- Local page parsing and the planned Whisper transcription path.
- The selected provider key, stored as `config/groq.key`, `config/openrouter.key`, or `config/gemini.key` with filesystem mode 0600 when configured.

The server never returns the key value and does not place it in SQLite, browser storage, logs, exports, or URLs.

## Leaves this Mac only after opt-in

Selected text and captures may be sent through the configured local gateway to Groq, OpenRouter Free, or Google Gemini for analysis. The app shows the selected provider and its terms in Settings. The current worker does not make that cloud call yet; cloud-dependent jobs remain visibly gated.

## User controls

- Notes and tags are editable and persist locally.
- JSON export is available per source.
- Original local files can be deleted after successful processing while notes, transcripts, captures, and search rows remain.
- Browser session access is off by default and is an explicit setting.
- There is no analytics, telemetry, sharing, or automatic upload in the MVP shell.

## Limits and residual risk

Local filesystem permissions are the primary protection for the local library. Anyone with access to the macOS account or data directory can read it. The app does not claim end-to-end encryption. Provider retention and quota behavior are governed by the selected provider's current terms; live provider validation is still pending.
