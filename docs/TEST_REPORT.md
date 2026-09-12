# Verification report

Date: 2026-09-12

## Automated checks

| Check | Result |
| --- | --- |
| `npm test` | PASS — 3 files, 5 tests |
| `npm run test:e2e` | PASS — 1 Playwright desktop smoke test |
| MCP initialize + `tools/list` smoke | PASS — four read-only tools advertised |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS with `--max-warnings=0` |
| `npm run build` | PASS — web, API, worker, MCP bundles |
| `npm run setup` | PASS — migrations/data directories initialized |
| `npm run demo:seed` | PASS — explicit fixtures seeded |

## Manual browser verification

The local app was inspected through the desktop browser surface at the default wide viewport. Search showed four seeded sources, selecting a source opened its summary/evidence/note panel, Add a link expanded inline, Explore rendered topic routes and website mentions, and Settings exposed the masked key field and browser-session controls. Browser console warnings/errors were empty.

## Pending live gates

- Instagram and YouTube acquisition with user-owned URLs and a Gemini key were not run.
- Whisper.cpp model download and local media transcription were not run because the optional media toolchain is not bundled in this repository.
- OmniRoute/Gemini calls, quota handling, and provider retention behavior were not live-tested.
- The 500 MiB upload path was not exercised through the browser.
- The MacBook Air M1 8 GB benchmark was not run; `npm run benchmark` remains an explicit pending gate.

## Environment notes

The development host currently reports Node 24.15.0 while the repository contract pins Node 22.23.2. `npm install` reported an engine warning and upstream audit findings; no forced audit fix was applied. Use `scripts/bootstrap.sh` to install the pinned runtime for release validation.
