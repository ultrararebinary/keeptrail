# Run the Keeptrail development snapshot

**Not release-ready.** The [2026-09-13 review](docs/CODE_REVIEW.md) found security and processing blockers. Use controlled test inputs until fixed. Do not expose the loopback service through a network or tunnel.

## Existing checkout

From the repository directory:

```sh
./scripts/keeptrail run build
./scripts/keeptrail start
```

Open [Keeptrail](http://127.0.0.1:4317). Stop an existing instance from its own terminal before restarting. Rebuilding does not reload the API or worker. The wrapper selects the private Node 22.23.2 installation when available, but does not configure all media-tool paths: that wiring remains a review finding.

## First installation

On the supported Apple Silicon Mac with development prerequisites installed:

```sh
./scripts/bootstrap.sh
./scripts/keeptrail run setup
./scripts/keeptrail run doctor
./scripts/keeptrail start
```

Bootstrap installs the pinned Node runtime and builds workspace dependencies. Setup installs tooling/models, including Homebrew FFmpeg. A successful doctor result is not end-to-end acceptance. Avoid global Node 24 for native dependencies built under Node 22.

Demo content is explicit and optional: `./scripts/keeptrail run demo:seed`. Never seed a user's library to satisfy a test. Tests should use temporary `KEEPTRAIL_DATA_DIR`; Playwright still needs isolation before routine use.

## Providers

Mistral, Groq, OpenRouter Free and Gemini appear in Settings. Use the intended provider's **Save and test** action. A saved key does not establish valid text/vision inference or free quota. Check the provider's own terms and limits; see [provider background](docs/PROVIDERS.md).

The review host already has a Mistral key file and configured flag. Do not delete or replace it because the earlier report claimed it was missing. Credential replacement and blank-key handling have open review findings; preserve private configuration. Never paste keys into chat, GitHub, screenshots or logs.

Selected text and captures leave the machine through local OmniRoute for cloud analysis. Audio transcription is intended to remain local. Browser-session settings currently do not reach yt-dlp and are not a working authentication recovery path.

## Debugging and implementation handoff

```sh
./scripts/keeptrail run debug
./scripts/keeptrail run debug -- <source-uuid>
```

Read [DEBUGGING.md](docs/DEBUGGING.md), [IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) and [TEST_REPORT.md](docs/TEST_REPORT.md).

[LUNA_PIPELINES_PROMPT.md](docs/LUNA_PIPELINES_PROMPT.md) is the controlling specification, superseding conflicting older MVP instructions. The next implementation agent must also read [CODE_REVIEW.md](docs/CODE_REVIEW.md) and add regression tests for the confirmed defects.
