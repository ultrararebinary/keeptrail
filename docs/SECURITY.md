# Security notes

## Threat model

The MVP assumes a single local macOS user and protects against accidental cross-origin mutation, unsafe URL fetches, oversized uploads, path traversal, and accidental secret exposure in the UI or repository.

Implemented controls include:

- Loopback-only server binding.
- Local-origin checks on POST/PATCH/DELETE requests.
- HTTP(S)-only URL normalization with embedded-credential, non-standard-port, localhost, private IPv4, and private IPv6 rejection.
- Redirects are not silently followed by the current worker; sources that require a session or redirect handling become `needs_review`.
- 5 MiB HTML and 500 MiB upload caps.
- Sanitized Readability text before indexing.
- Resolved asset paths constrained below the data directory.
- Protected data-directory and key-file permissions.
- No secret values in API responses, browser storage, logs, or exports.

## Reporting

Do not open a public issue with private URLs, API keys, personal media, or database files. For a suspected vulnerability, contact the repository owner privately and include a minimal reproduction that does not contain user data. Dependency upgrades should be reviewed against the pinned Node and native-module contract.
