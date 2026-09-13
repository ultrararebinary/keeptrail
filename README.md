# Keeptrail

**Find your way back.**

A local discovery library that turns saved videos, links, and images into searchable notes and visual connections.

## Status

**Development snapshot — review requires changes.** Real integrations and the UI exist; 23 tests plus lint/typecheck/build pass. The [2026-09-13 review](docs/CODE_REVIEW.md) found internal acquisition, network-safety, queue and indexing defects. These are not merely external provider blockers. This snapshot is not release-ready; avoid untrusted media until the security findings are resolved.

## Build brief

The intended MVP combines a searchable library with a transit-map exploration view. It targets a MacBook Air M1 with 8 GB RAM, local Whisper transcription and selected text/vision inference through isolated OmniRoute. Small/Base speech benchmarking, semantic retrieval and end-to-end processing remain acceptance gates, not completed capabilities.

- [Full implementation contract](docs/LUNA_PIPELINES_PROMPT.md)
- [Free provider setup](docs/PROVIDERS.md)
- [Key preparation and agent handoff](QUICKSTART.md)
- [Brand proposal](docs/BRAND.md)
- [Implementation status](docs/IMPLEMENTATION_STATUS.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Privacy boundary](docs/DATA_PRIVACY.md)

## Intended data flow

Local storage and transcription, with selected text and captures sent through local OmniRoute to the provider selected in Settings. Mistral, Groq, OpenRouter Free and Gemini are the configured options. Account terms and quotas apply; saving a key does not establish provider health or free-tier availability.

## Start locally

```sh
./scripts/keeptrail run build
./scripts/keeptrail start
```

Open [Keeptrail](http://127.0.0.1:4317). See [QUICKSTART.md](QUICKSTART.md) for first-install instructions and known runtime limitations, and [docs/TEST_REPORT.md](docs/TEST_REPORT.md) for verification evidence. A passing environment check does not establish a working video pipeline.

## License

MIT for repository-authored source and documentation. External dependencies and models retain their own licenses. Design-reference images are AI-generated illustrations and do not imply affiliation with any depicted website or platform.
