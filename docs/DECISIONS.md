# Decisions

A running log of choices that shape the project. Add an entry when you make a choice someone might
later question. Newest at the bottom.

**Status:** _Confirmed_ = settled; change only with team agreement. _Provisional_ = our current
default; revisit when we know more.

---

### 1. One Next.js application

**Confirmed.** UI, API routes, and server logic live in a single Next.js app. One dev server, one
deploy, shared types with no package publishing. A hackathon team gains nothing from service
boundaries. See [ARCHITECTURE.md](ARCHITECTURE.md#why-one-application) for when to split.

### 2. Ingestion and parsing are centralized

**Confirmed.** All file reading, validation, and parsing goes through `src/lib/ingestion`. Several
features will likely consume documents; one pipeline means one set of bugs, limits, and error
codes. Features work on the normalized `ParsedDocument`, never raw files.

### 3. Shared contracts are typed and live in `src/types`

**Confirmed.** API request and response shapes are TypeScript types shared by client and server,
wrapped in one `ApiResponse` envelope. Mocks are type-checked against them. No GraphQL or
code generation: with one app and one language, plain types are enough.

### 4. Server-only modules are enforced with `server-only`

**Confirmed.** Server logic modules import `server-only`, so accidentally bundling them into the
browser fails the build instead of leaking code or crashing at runtime.

### 5. Only text and Markdown parsing for now

**Provisional.** We support `.txt` and `.md` using no dependencies. PDF, DOCX, and OCR libraries
are heavy and differ a lot in quality, so we choose one when a feature needs that format.

### 6. No database, auth, or AI SDK yet

**Provisional.** We add each once a feature requires it and we know the shape of the data or
the provider. The ingestion module is storage-agnostic so persistence can be layered on.

### 7. UI design is deferred to the UI owner

**Provisional.** Tailwind CSS is installed, but no design system, fonts, tokens, or components
exist yet. The UI developer defines them in [DESIGN.md](DESIGN.md). Backend and feature logic must
not depend on any particular UI, so the UI can be built later without rewiring.

### 8. Short-lived branches and squash merges into `main`

**Confirmed.** No GitFlow, no long-lived `develop` branch. Small PRs merged often keep conflicts
small. See [CONTRIBUTING.md](CONTRIBUTING.md).

### 9. Vitest for unit tests, no E2E yet

**Provisional.** Vitest is fast and needs almost no configuration. Shared logic must be tested. E2E
(Playwright) can come when there are real user flows worth protecting.

### 10. PDF.js first, external OCR only with consent

**Confirmed.** PDF.js is the default parser and preserves page text, positions, metadata, and references. A deterministic quality gate can recommend OCR, but Mistral or Mathpix only receives the document after explicit consent. Both providers normalize into the same `ParsedDocument` contract.

### 11. Gemini is server-only and schema constrained

**Confirmed.** Concept intelligence and tutoring use the official Google Gen AI SDK from server-only modules. The model is environment-configurable. Analysis uses a JSON response schema, Zod validation, bounded retries, and a deterministic graph validator; model claims never determine graph validity on their own.

### 12. The browser owns all state; the server is stateless

**Confirmed.** Parsed documents, analyses, and mastery live in browser IndexedDB
(`src/lib/browser-store.ts`), keyed by content hash. API routes receive what they need in the request
body and keep nothing in memory, so restarts lose nothing and no database is needed. Quizzes carry
their own answer keys (a self-check aid, not an exam). Revisit if data must sync across browsers or
devices; that requires accounts and server storage.

### 13. Product visual language

**Confirmed.** KnowBefore uses an editorial, warm-neutral interface with Georgia display type, system sans-serif controls, forest green for verified structure, and clay for inferred or advanced information. Panels use square edges, fine rules, restrained shadows, and no decorative gradients beyond a subtle page wash.

### 14. Optional independent review for cross-paper conflicts

**Provisional.** Gemini proposes claim comparisons from two to four documents. The server verifies each
quoted source passage against its cited page. Only candidate conflicts go to Grok for an
independent verdict through the xAI Responses API, using plain `fetch` and `store: false`.
Without Grok agreement, a conflict remains unconfirmed. This adds no SDK or server persistence.

### 15. Briefs reuse verified synthesis

**Provisional.** The Research Brief is built in the browser from saved synthesis findings and the
project's paper list. No second model call rewrites the evidence. Users can edit the question,
notes, and finding summaries; edited summaries are visibly marked for source review. Briefs stay
in the project's IndexedDB record and use a separate print page on the same origin.

### 16. Gap ideas and paper links retain their provenance

**Provisional.** Gap suggestions are derived from the project's verified synthesis and labeled as
questions for further search. Saved ideas keep their evidence and reviewed document set. The paper
graph shows synthesis-backed agreement or disagreement separately from inferred topic overlap.
Citation edges use OpenAlex reference IDs when the provider supplies them; missing matches are
treated as unknown, not evidence of no citation.

### 17. ElevenLabs over plain `fetch`, read one segment at a time

**Provisional.** Voice uses ElevenLabs' REST API through `fetch` (no SDK dependency) from a
server-only module, so the key never reaches a client. Papers are cleaned and split in the browser,
spoken one segment at a time with the next two prefetched, and cached in IndexedDB, because
credits are billed per character and a full paper is roughly 50,000 characters. Flash v2.5 is the
default model (fastest, cheapest); Multilingual v2 is the high-quality option. Equations and code
are not read; the reader is pointed to the PDF page instead. The browser's built-in voice is the
fallback when no key is configured.

### 18. Save topic search snapshots with browser projects

**Provisional.** Each successful topic search made with a selected project stores its query,
provider trail, and returned records on that project in IndexedDB. Reopening a search uses the
snapshot, so the result is reproducible even when OpenAlex changes or is unavailable. Keep the
newest 20 searches per project to bound browser storage; older project records need no migration.

### 19. Preview only what the provider abstract supports

**Provisional.** Study-at-a-glance cards use verbatim OpenAlex abstract sentences for methods,
sample or data, measures, results, and limitations. The client groups clear keyword matches
without generating claims or downloading PDFs. Missing matches are labeled as absent from the
preview, and each excerpt links to the provider record. Full-paper fields can be added after a
source-aware analysis path is available for each recommended paper.

### 20. Analyze recommended PDFs only after explicit upload

**Provisional.** A reader may upload a recommended paper's PDF for a deeper card preview. The
server parses it through the shared ingestion module and uses Gemini to select page excerpts for
five study fields. It removes quotes that do not match the cited parsed page. The card links to
the user's local PDF during that session; no remote PDF fetching, server persistence, or claim
that the uploaded file matches the provider record is added. Reject extracted text over 160,000
characters so a preview never silently omits part of the PDF.
