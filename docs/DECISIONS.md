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

**Superseded by 15 for the vault.** _Original decision:_ KnowBefore uses an editorial, warm-neutral interface with Georgia display type, system sans-serif controls, forest green for verified structure, and clay for inferred or advanced information. Panels use square edges, fine rules, restrained shadows, and no decorative gradients beyond a subtle page wash.

### 14. ElevenLabs over plain `fetch`, read one segment at a time

**Provisional.** Voice uses ElevenLabs' REST API through `fetch` (no SDK dependency) from a
server-only module, so the key never reaches a client. Papers are cleaned and split in the browser,
spoken one segment at a time with the next two prefetched, and cached in IndexedDB, because
credits are billed per character and a full paper is roughly 50,000 characters. Flash v2.5 is the
default model (fastest, cheapest); Multilingual v2 is the high-quality option. Equations and code
are not read; the reader is pointed to the PDF page instead. The browser's built-in voice is the
fallback when no key is configured.

### 15. The vault looks and works like Obsidian

**Confirmed.** The main UI (`/`) recreates Obsidian's default theme and layout: ribbon, file tree,
tabbed and split work area, right sidebar, status bar, dark by default with a light option. Papers,
notes, and AI chats are all files in one tree. The team chose this so the product feels like a
familiar research vault rather than a dashboard. The editorial palette from decision 13 remains
only in the classic workspace (`/classic`), which the vault replaces.

### 16. Lucide icons

**Confirmed.** `lucide-react` provides the vault's icons. It is the icon set Obsidian uses, so the
look matches, and icons are tree-shaken per import.

### 17. Annotations and chat stay in the browser

**Provisional.** Highlights, comments, notes, and chats are stored in IndexedDB like everything
else (decision 12). `/api/chat` receives the conversation and paper text per request and stores
nothing. When the team's vault backend exists, these stores are what it syncs.
