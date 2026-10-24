# HackPSU 2026

The foundation for our HackPSU 2026 project: one Next.js app with typed API contracts and a shared
file-ingestion pipeline that every feature reuses. The UI has not been built yet.

The product itself is still being defined. This repo gives us a clean place to build it in parallel
without stepping on each other.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS 4 · Vitest · ESLint ·
Prettier · npm · GitHub Actions

## Getting started

Requires Node.js 22 or newer (`.nvmrc` is provided).

```bash
npm install
npm run dev        # http://localhost:3000
```

No environment variables are needed yet.

## Commands

| Command                | What it does                                                  |
| ---------------------- | ------------------------------------------------------------- |
| `npm run dev`          | Start the dev server                                          |
| `npm run build`        | Production build                                              |
| `npm start`            | Serve the production build                                    |
| `npm run lint`         | ESLint                                                        |
| `npm run typecheck`    | Generate route types, then `tsc --noEmit`                     |
| `npm test`             | Run unit tests once (`npm run test:watch` to watch)           |
| `npm run format`       | Format everything with Prettier                               |
| `npm run format:check` | Check formatting without writing                              |
| `npm run check`        | Lint, typecheck, format check, and tests: run before every PR |

CI runs the same checks plus `npm run build` on every pull request.

## Project layout

```
src/
  app/                  Pages, layouts, and API routes
    api/ingest/         POST /api/ingest, the example ingestion endpoint
  components/           Reusable UI primitives (empty until the UI is designed)
  features/             Feature-specific code, one folder per feature
  lib/
    ingestion/          Shared ingestion pipeline (server-only)
    api/                Browser-safe API clients and mock payloads
  types/                Shared contracts: API envelope, ingestion types
tests/fixtures/         Sample files for tests and manual testing
docs/                   Architecture, contributing, design, and decision docs
```

## Where to start

| You are working on…            | Start in                           | Read                                    |
| ------------------------------ | ---------------------------------- | --------------------------------------- |
| UI, layout, visual design      | `src/app`, `src/components`        | [DESIGN.md](docs/DESIGN.md)             |
| Parsing, ingestion, backend    | `src/lib/ingestion`, `src/app/api` | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| A product feature              | `src/features/<feature-name>`      | [ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Anything, before your first PR |                                    | [CONTRIBUTING.md](docs/CONTRIBUTING.md) |

Past decisions and their reasons are in [DECISIONS.md](docs/DECISIONS.md).

## What works today

- **File ingestion for `.txt` and `.md` (up to 5 MB).** Validation, strict UTF-8 decoding,
  Markdown section splitting, and a normalized `ParsedDocument` result.
- **`POST /api/ingest`.** Exposes the pipeline with a typed, predictable response envelope.
- **A typed browser client** (`uploadDocument`) and **mock payloads** for frontend work without a
  backend.
- **Unit tests** for the pipeline, including a check that the mock matches real output.

Try the endpoint:

```bash
curl -F "file=@tests/fixtures/sample.md" http://localhost:3000/api/ingest
```

## Not built yet (on purpose)

The UI and design system (see [DESIGN.md](docs/DESIGN.md)); PDF, DOCX, and image (OCR) parsing;
AI extraction; persistence/database; authentication;
deployment. We add each one when a real feature needs it. See
[ARCHITECTURE.md](docs/ARCHITECTURE.md#extending-ingestion) for where each would plug in.
