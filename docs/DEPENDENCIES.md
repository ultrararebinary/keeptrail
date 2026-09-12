# Dependencies and optional tools

## Pinned application dependencies

The repository uses npm workspaces and commits the generated `package-lock.json`. Runtime versions are pinned in the manifests and currently include:

- Node 22.23.2 and npm 10 or newer.
- Fastify 5, better-sqlite3 12, React 19, Vite 7, and TypeScript 5.9.
- Mozilla Readability, sanitize-html, sharp, marked, and yazl for local page parsing, sanitization, image metadata, Markdown, and exports.
- `@modelcontextprotocol/sdk` for the read-only stdio MCP server.
- Vitest, Testing Library, and Playwright for automated verification.

## Optional media tooling

The setup and doctor scripts look for `ffmpeg`, `ffprobe`, and `python3`. Their absence does not prevent the Search/Explore shell or ordinary page acquisition from running. They are required for the planned local media path:

- `ffmpeg` / `ffprobe`: media inspection and deterministic audio/frame extraction.
- `whisper.cpp` v1.9.4 plus the multilingual `ggml-small.bin` model: on-device transcription.
- Quantized multilingual-e5-small: local CPU embeddings.
- OmniRoute 3.8.50 plus one selected free multimodal provider: Groq Qwen 3.6 (recommended), OpenRouter Free Models Router, or Google Gemini.

No API key is read from an environment variable. The UI writes the selected provider key to the protected local config file described in [DATA_PRIVACY.md](DATA_PRIVACY.md).

## Supply-chain notes

Run `npm install` with the committed lockfile. Do not use `npm audit fix --force` as part of routine setup because it can move the fixed dependency surface without a reviewed migration. The current development install reports upstream audit findings; see the latest test report before treating them as resolved.
