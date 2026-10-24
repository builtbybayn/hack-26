# Features

One folder per user-facing capability: `src/features/<feature-name>/`. A feature holds its own UI,
state, and feature-only types.

Features **reuse** shared code instead of re-implementing it:

- File uploads and parsing: `uploadDocument()` from `@/lib/api/ingest-client` (browser) or
  `ingestFile()` / `ingest()` from `@/lib/ingestion` (server).
- Shared contracts: `@/types/*`.
- Shared UI: `@/components/*`.

When a second feature needs something from your folder, move it to `src/lib` or `src/components`
instead of copying it. See [docs/ARCHITECTURE.md](../../docs/ARCHITECTURE.md).
