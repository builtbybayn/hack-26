# Work tracks

Three people build in parallel. Each owns one track:

| Track                                            | Builds                                                             | Owner |
| ------------------------------------------------ | ------------------------------------------------------------------ | ----- |
| [A: Analysis](track-a-analysis.md)               | Better prerequisite checks, plus a cross-paper contradiction check | _TBD_ |
| [B: Recommendations](track-b-recommendations.md) | Real papers related to the one being read                          | _TBD_ |
| [C: Voice](track-c-voice.md)                     | ElevenLabs text-to-speech for explanations                         | _TBD_ |

The Chrome extension is not one of these tracks; it is being built separately (see
[The extension](#the-extension) below).

## What already exists

Read [ARCHITECTURE.md](../ARCHITECTURE.md) once. In short:

```text
PDF → POST /api/documents/parse → ParsedDocument ─┐
                                                   ├→ stored in the browser (src/lib/browser-store.ts)
      POST /api/documents/analyze → DocumentAnalysis ┘   (concept graph + learning path)
      POST /api/explain → explanation text with page references
```

- **`ParsedDocument`** (`src/types/ingestion.ts`): the normalized paper: `id` (SHA-256 of the
  file), `title`, `pages[]`, `sections[]`, `metadata`.
- **`DocumentAnalysis`** (`src/types/intelligence.ts`): `understanding` (subject, topics,
  terminology), `graph` (concepts, dependencies, `foundationalConceptIds`), `learningPath`.
- **The server is stateless.** The browser stores documents, analyses, and mastery and sends what a
  request needs in its body. Never keep state in server memory.
- **Every route returns** `{ ok: true, data }` or `{ ok: false, error: { code, message } }`.

All three tracks **read** `ParsedDocument` and `DocumentAnalysis`. No track changes them. That is
what makes the tracks independent.

## Rules for every track

1. **Contract first.** Your first PR is only your types file (`src/types/<track>.ts`) and a mock
   response (`src/lib/api/<track>-mock.ts`). Get it merged in the first hour. Then build against it.
2. **Stay in your folders.** Each track lists the files it owns. Don't edit another track's files;
   ask its owner.
3. **UI goes in your own component** (`src/features/<track>/`). The main screen,
   `src/features/document-intelligence/DocumentIntelligence.tsx`, is one large shared file. Add
   one line to mount your component there, nothing more.
4. **One shared AI layer.** Track A creates `src/lib/ai/` in its first hour (Gemini and Grok
   helpers). Everyone calls models through it; nobody creates their own SDK client.
5. **Server-only secrets.** API keys live in `.env.local` and only in `src/lib/**` server modules.
   Never `NEXT_PUBLIC_`, never in the extension, never in a response.
6. **`.env.example` is append-only.** Add your variables at the bottom with an empty value.
7. **Small PRs, merged often.** Branch from `main` (`feat/<track>-<thing>`), run `npm run check`,
   open a PR, merge, repeat. Integration happens continuously, not at the end.

## Shared files: who to ask

| File                                                          | Coordinate with                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/types/ingestion.ts`, `src/types/intelligence.ts`         | Everyone: these are the shared inputs                                            |
| `src/lib/ai/*`                                                | Track A                                                                          |
| `src/lib/browser-store.ts`                                    | One change at a time: every new store bumps `DB_VERSION`, and two bumps conflict |
| `src/features/document-intelligence/DocumentIntelligence.tsx` | Mount line only; announce in chat before editing                                 |
| `src/lib/api/route-helpers.ts`                                | Everyone; additive changes only                                                  |

## Environment variables

| Variable                                                           | Track | Notes                                    |
| ------------------------------------------------------------------ | ----- | ---------------------------------------- |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                                   | All   | Already exists                           |
| `XAI_API_KEY`, `XAI_MODEL`                                         | A     | Grok second opinion; optional at runtime |
| `OPENALEX_API_KEY` / `SEMANTIC_SCHOLAR_API_KEY` (if needed)        | B     | Check the provider's current auth rules  |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL_ID` | C     | Server-only                              |

Every feature must work, or fail with a clear error code, when its key is missing. Teammates
without your key still need `npm run dev` and `npm test` to work.

## Timeline

| When            | What                                                                                           |
| --------------- | ---------------------------------------------------------------------------------------------- |
| First hour      | Each track merges its contract PR. Track A merges `src/lib/ai/`.                               |
| Build           | Each track builds its server module and route against its mock; UI component against the mock. |
| Checkpoint 1    | Each route works with `curl` and has unit tests. Merge.                                        |
| Checkpoint 2    | Each component mounted in the main screen, using the real route. Merge.                        |
| Before the demo | Run the full demo flow below together. Fix integration issues only; no new features.           |

## The demo flow this adds up to

1. Upload a paper. The concept graph and learning path appear (exists).
2. **A:** prerequisites flagged against what the reader already knows.
3. **B:** "Read these first": real papers for the foundational concepts, plus related work.
4. Explain a concept (exists). **C:** press Listen to hear it.
5. Upload a second paper. **A:** the contradiction check compares them, with evidence from both.

## The extension

The extension is currently a popup that opens the app. When it becomes a side panel, the panel
should load a page from this app (for example `http://localhost:3000/panel`) rather than bundling
its own UI. Then it shares the app's browser storage and API client automatically, and none of
the three tracks need extension-specific code.
