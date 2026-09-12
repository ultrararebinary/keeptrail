# Keeptrail

**Find your way back.**

A local discovery library that turns saved videos, links, and images into searchable notes and visual connections.

## Status

**Specification stage. The application is not implemented yet.** This repository currently contains the approved brand direction, UI exploration references, and a detailed MVP implementation prompt. Screenshots under `docs/design` are generated design references containing illustrative content, not functioning product screenshots.

## Build brief

The MVP combines a search-oriented library with a transit-map exploration view. It targets a MacBook Air M1 with 8 GB RAM, stores data locally, transcribes through Whisper Small multilingual, and uses Gemini 2.5 Flash-Lite through an isolated OmniRoute instance for text and vision analysis.

- [Full implementation prompt](docs/MVP_AGENT_PROMPT.md)
- [Key preparation and agent handoff](QUICKSTART.md)
- [Brand proposal](docs/BRAND.md)

## Intended data flow

Local storage and transcription. Selected text and captures are sent through a local OmniRoute gateway to Google for analysis. Free provider quotas and source-download restrictions apply. Use a Gemini API project without billing enabled; no paid provider fallback is planned.

## License

MIT for repository-authored source and documentation. External dependencies and models retain their own licenses. Design-reference images are AI-generated illustrations and do not imply affiliation with any depicted website or platform.
