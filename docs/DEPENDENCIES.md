# Dependencies and optional tools

## Pinned application dependencies

The repository uses npm workspaces and commits the generated `package-lock.json`. Runtime versions are pinned in the manifests and currently include:

- Node 22.23.2 and npm 10 or newer.
- Fastify 5, better-sqlite3 12, React 19, Vite 7, and TypeScript 5.9.
- Mozilla Readability, sanitize-html, sharp, marked, and yazl for local page parsing, sanitization, image metadata, Markdown, and exports.
- `@modelcontextprotocol/sdk` for the read-only stdio MCP server.
- Vitest, Testing Library, and Playwright for automated verification.

## Pinned integration tooling

The setup and doctor scripts install or verify the following exact integration surface. Their absence does not prevent the Search/Explore shell or ordinary page acquisition from running, but it blocks the corresponding processing stage:

- Homebrew `ffmpeg` / `ffprobe`: media inspection and deterministic audio/frame extraction. A third-party binary is not accepted as the contract tool.
- `whisper.cpp` v1.9.4 plus the multilingual `ggml-small.bin` model: on-device transcription.
- Quantized multilingual-e5-small: local CPU embeddings.
- OmniRoute 3.8.50 plus one selected free multimodal provider: Groq Qwen 3.6 (recommended), OpenRouter Free Models Router, Mistral Free, or Google Gemini.

No provider API key is read from the parent environment. The UI writes the selected provider key to the protected local config file described in [DATA_PRIVACY.md](DATA_PRIVACY.md); the gateway supervisor feeds it to the pinned OmniRoute `keys add <provider> --stdin` interface and does not log the value.

## Supply-chain notes

Run `npm ci` with the committed lockfile. `scripts/bootstrap.sh` installs the pinned Node 22.23.2 runtime when needed; `npm run setup` installs the pinned tools and verified model files under `.tools`; `npm run doctor` reports exact missing or mismatched prerequisites. Do not use `npm audit fix --force` as part of routine setup because it can move the fixed dependency surface without a reviewed migration.
