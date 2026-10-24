<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project rules

Read `docs/ARCHITECTURE.md` before structural changes and `docs/DESIGN.md` before UI work.

- One Next.js app. Do not add services, databases, auth, or AI SDKs without a recorded decision in `docs/DECISIONS.md`.
- All file parsing goes through `src/lib/ingestion` (`ingest` / `ingestFile`). Never parse files inside a feature.
- `src/lib/ingestion` is server-only. Client code uses `src/lib/api/*-client.ts` and types from `src/types`.
- API routes return the `ApiResponse` envelope from `src/types/api.ts`. Contract changes update the mock, consumers, and `docs/ARCHITECTURE.md` together.
- The server is stateless. Persist data in the browser through `src/lib/browser-store.ts`; never keep state in server memory.
- Feature code lives in `src/features/<name>`; promote to `src/components` or `src/lib` only when a second consumer exists.
- Run `npm run check` before finishing; add tests for shared logic.
