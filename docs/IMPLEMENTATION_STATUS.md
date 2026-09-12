# Implementation status

This file tracks the Keeptrail MVP contract. It is updated as implementation and verification progress.

## Current state

- Repository: initialized on `main`; MVP shell is implemented and verified locally.
- Product/design context: `PRODUCT.md` and `DESIGN.md` are present.
- Design references: `docs/design/index-reference.png` and `docs/design/parcours-reference.png` inspected and treated as layout references only.
- UI/UX direction: approved graphite Search + Explore product shell with coral action, semantic topic routes, evidence-first detail, and accessible list alternatives.

## Acceptance tracking

| Area | Status | Evidence / blocker |
| --- | --- | --- |
| Repository and docs | implemented | Runnable workspace, pinned dependencies, bootstrap, architecture/privacy/security docs, and explicit status tracking. |
| Search and Explore UI | implemented | Search/Explore/Settings shell, filters, detail evidence, inline capture, map/list alternative, responsive CSS, and live browser verification. |
| Persistent data model | implemented | SQLite migrations, FTS table, indexes, topics, durable jobs, local file directories, and isolated Vitest coverage. |
| Acquisition and processing | partial | URL validation, ordinary-page Readability extraction, upload limits, deduplication, and durable queue are implemented. Social download, Whisper, and rich media analysis remain pending. |
| Managed provider/OmniRoute setup | partial | Settings now supports Groq, OpenRouter Free, and Gemini with separate mode-0600 key files and provider-specific setup links. Actual OmniRoute calls and quota enforcement remain pending. |
| Search/indexing | partial | Local keyword search, snippets, evidence IDs, and FTS schema exist. Embedding generation and hybrid reranking remain pending. |
| Exports/storage/settings | implemented | JSON export, note/tag updates, original deletion endpoint, storage summary, settings, and privacy copy are covered. |
| Read-only MCP | implemented | stdio server exposes four read-only library/topic/passage tools. |
| Automated tests | implemented | Vitest unit/component coverage and Playwright desktop smoke coverage pass locally. |
| Live social/provider validation | not run | Requires user-provided live URLs and a key for the selected provider. |
| M1 benchmark | not run | Requires local benchmark run on target hardware. |
