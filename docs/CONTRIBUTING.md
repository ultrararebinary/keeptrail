# Contributing

Keeptrail favors small, reviewable changes that preserve the local-first boundary.

```sh
npm install
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Use `npm run demo:seed` only for local fixture work. It is explicit and writes four illustrative records to the configured data directory. Do not commit local databases, uploaded media, model files, Playwright reports, or API keys.

For UI changes, check Search, Explore, Settings, empty/loading/error states, keyboard focus, reduced motion, and the list alternative for the map. Keep product copy in plain international English and preserve the approved graphite/coral/topic-token system in `DESIGN.md`.

For backend changes, add or update a focused Vitest test, validate the Zod response contract, and describe any provider or security boundary change in `docs/IMPLEMENTATION_STATUS.md`.
