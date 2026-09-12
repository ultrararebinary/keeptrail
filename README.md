# Keeptrail

**Find your way back.**

A local discovery library that turns saved videos, links, and images into searchable notes and visual connections.

## Status

**MVP shell implemented.** Keeptrail now has a local Fastify API, SQLite migrations, a durable worker queue, a desktop-first Search/Explore UI, settings, exports, read-only MCP tools, fixture seeding, unit tests, and a Playwright smoke test. Provider-backed social acquisition, Whisper media transcription, local embeddings, and live OmniRoute analysis remain explicit follow-up gates and are documented as such.

## Build brief

The MVP combines a search-oriented library with a transit-map exploration view. It targets a MacBook Air M1 with 8 GB RAM, stores data locally, transcribes through Whisper Small multilingual, and uses a selected free multimodal provider (Groq recommended, OpenRouter Free alternative, Gemini optional) through an isolated OmniRoute instance for text and vision analysis.

- [Full implementation prompt](docs/MVP_AGENT_PROMPT.md)
- [Free provider setup](docs/PROVIDERS.md)
- [Key preparation and agent handoff](QUICKSTART.md)
- [Brand proposal](docs/BRAND.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Privacy boundary](docs/DATA_PRIVACY.md)

## Intended data flow

Local storage and transcription. Selected text and captures are sent through a local OmniRoute gateway to the provider selected in Settings. Groq, Mistral Free, and OpenRouter Free are the recommended free options; Google Gemini remains optional. Free provider quotas and source-download restrictions apply. Keeptrail never silently switches to paid inference.

## Start locally

```sh
npm install
npm run build
npm run setup
npm run demo:seed # optional, explicit fixture data only
npm start
```

Open `http://127.0.0.1:4317`. Use `npm run doctor` for environment checks. See [QUICKSTART.md](QUICKSTART.md) for the Node 22.23.2 bootstrap path and [docs/TEST_REPORT.md](docs/TEST_REPORT.md) for current verification evidence.

## License

MIT for repository-authored source and documentation. External dependencies and models retain their own licenses. Design-reference images are AI-generated illustrations and do not imply affiliation with any depicted website or platform.
