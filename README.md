# Fluid Research

Fluid Research turns academic PDFs into prerequisite knowledge graphs and personalized learning paths. It extracts a PDF locally with PDF.js, optionally uses consented Mistral or Mathpix OCR, asks Gemini for structured concept analysis, validates the graph deterministically, and stores learner mastery in browser IndexedDB.

## Architecture

```text
PDF upload → PDF.js → quality gate → optional OCR → canonical document
                                                      ↓
IndexedDB storage ← learning path ← graph validation ← Gemini
                         ↓
                 React Flow + tutor
```

This remains one Next.js 16 application: interactive UI in `src/features`, typed API routes in `src/app/api`, browser-safe clients in `src/lib/api`, and server-only parsing/provider logic in `src/lib`. The server is stateless: parsed documents, analyses, and mastery are stored in the browser (IndexedDB, `src/lib/browser-store.ts`) and sent with each request. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for contracts and module boundaries.

## Team work tracks

Parallel work is split into three tracks: analysis (prerequisites and contradictions), paper
recommendations, and voice. Start with [docs/tracks/README.md](docs/tracks/README.md).

Planned research features and their implementation order are in [docs/ROADMAP.md](docs/ROADMAP.md).

## Install and run

Requires Node.js 22 or newer.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000` for the research vault. Standard PDF extraction works without provider keys. Gemini is required for concept analysis, tutoring, and cross-paper comparison. Grok provides an optional independent contradiction review.

## Environment configuration

| Variable                             | Purpose                                                       |
| ------------------------------------ | ------------------------------------------------------------- |
| `GEMINI_API_KEY`                     | Server-only Google AI Studio API key                          |
| `GEMINI_MODEL`                       | Supported Gemini model; defaults to `gemini-3.5-flash`        |
| `GEMINI_FALLBACK_MODEL`              | Used when the main model is overloaded; `gemini-2.5-flash`    |
| `XAI_API_KEY`                        | Optional server-only Grok key for second-opinion review       |
| `XAI_MODEL`                          | Grok model; defaults to `grok-4.7`                            |
| `OPENALEX_API_KEY`                   | Optional key for a dedicated OpenAlex search budget           |
| `MISTRAL_API_KEY`                    | Server-only Mistral OCR key                                   |
| `MISTRAL_OCR_MODEL`                  | Optional OCR model override; defaults to `mistral-ocr-latest` |
| `MATHPIX_APP_ID` / `MATHPIX_APP_KEY` | Server-only Mathpix credentials                               |
| `XAI_API_KEY` / `XAI_MODEL`          | Optional Grok check of candidate cross-paper conflicts        |
| `PDF_PARSER`                         | Deployment default (`auto` is recommended)                    |
| `OCR_PROVIDER`                       | Deployment default (`mistral` or `mathpix`)                   |
| `ELEVENLABS_API_KEY`                 | Server-only ElevenLabs key for read-aloud and Listen          |
| `ELEVENLABS_MODEL_FAST` / `_HIGH`    | Optional model overrides for Fast and High quality            |

Never prefix these with `NEXT_PUBLIC_`. They must not enter the browser bundle, extension storage, or API responses.

### Gemini setup

Create a key in Google AI Studio, set `GEMINI_API_KEY`, and choose a currently supported model through `GEMINI_MODEL`. The backend uses the official `@google/genai` SDK, JSON response schemas, Zod validation, and at most three attempts for malformed model output.

### Mistral OCR setup

Create a Mistral API key and set `MISTRAL_API_KEY`. The adapter sends one base64 PDF to the official OCR endpoint only after the user checks the external-processing consent control. Tables, page Markdown, equations, headings, and page references are normalized into the canonical document shape.

### Mathpix setup

Set both `MATHPIX_APP_ID` and `MATHPIX_APP_KEY`. Mathpix is intended for STEM-heavy documents; its asynchronous PDF conversion is polled with a bounded timeout and converted from Markdown/LaTeX to the same canonical shape.

## The research vault

The app opens on an Obsidian-style vault ([docs/DESIGN.md](docs/DESIGN.md)):

1. **Import a paper** with the upload button (or drag a PDF onto the window). It is saved in this
   browser and analyzed automatically: concepts and prerequisites, related papers, and a
   contradiction check against saved papers on the same topics and published papers found by
   the search (compared by abstract).
2. **Read and annotate.** Select text to highlight it (four colors), add a comment that appears in
   the margin beside it, or **Ask AI** about the passage. The highlighter button highlights as you
   select. Ctrl+Z / Ctrl+Shift+Z undo and redo.
3. **Chat.** Ask AI opens a chat beside the paper with the passage quoted; answers cite pages.
   Chats are files in the tree, like notes, and can include several papers.
4. **Notes** are Markdown with `[[wikilinks]]` to other notes, papers, and chats; Ctrl+E toggles
   reading view. The right sidebar shows the open paper's analysis, highlights, related papers,
   contradiction check, read-aloud, and backlinks.
5. **Research projects** (flask icon in the ribbon) opens a tab for topic-first paper search,
   projects, cross-paper synthesis, the research brief, gap ideas, and the paper graph. The paper
   you're viewing is offered as context.
6. Ctrl+O opens the quick switcher; Ctrl+Shift+F searches the text of every paper, note, and chat.

Everything stays in this browser (IndexedDB). The original single-page workspace with the concept
map and quizzes is at `/classic`.

## PDF upload flow (classic workspace)

1. Choose a PDF (maximum 25 MB).
2. Choose Automatic, Standard, or Advanced OCR.
3. If external OCR may run, select a provider and explicitly consent.
4. Analyze. PDF.js preserves pages, text positions, metadata, and page references. Automatic mode stays local unless quality is low **and** consent is checked.
5. Inspect the graph, dependency evidence, learning path, explanations, source pages, and quizzes.
6. Manual mastery changes and passed assessments persist in IndexedDB. Opening an explanation does not change mastery.
7. Add analyzed documents to a research project, synthesize two to four of them, and create an editable Research Brief with a print view.
8. Explore possible gaps from that synthesis and inspect a graph linking project papers by verified findings or topic overlap.
9. After analyzing another paper, compare two to four saved documents for possible conflicts with quotes from both sources.

## Chrome extension development

`extension/` is a Manifest V3 side panel. It holds no secrets and almost no UI: the panel is the
app's `/panel` page in an iframe, so it shares the app's code, API, theme, and browser storage
(the whole vault). `extension/sidepanel.js` only bridges what needs Chrome APIs: the active tab,
the paper it shows, and opening the vault tab.

1. Run `npm run dev` (the extension expects `http://localhost:3000`).
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select the repository's `extension` directory. Chrome 114 or newer is required.
4. Pin Fluid Research and click its icon to open the side panel.

The panel follows the active tab. At the top is the assistant (a placeholder sprite whose motion
and color follow the agent state; see "Agent activity states" in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)). Below it:

- **On a PDF:** **Analyze this paper** saves it to the vault and runs the analysis (concepts and
  prerequisites, then related papers and a contradiction check), step by step. **Open in vault**
  opens the paper in the vault at the page in the **Page** box, reusing an open vault tab and
  saving the paper first if needed. The page starts from the link (`…pdf#page=4`); Chrome's PDF
  viewer doesn't tell extensions which page you scrolled to, so set it before sending.
- **Anywhere else:** **New project** or **Ask**.
  - **New project:** describe what you want to research. It creates a project folder in the vault
    (`Notes/Roadmap`, `Papers`) whose Roadmap note lists, in order, the concepts to learn and real
    papers to read (from OpenAlex), from foundations to the research frontier. Keep shaping it in
    the panel ("skip the basics", "add a stage on…"); each reply rewrites the note. **Open roadmap
    in vault** opens it.
  - **Ask:** a chat with the assistant. **Use this page** adds the page's text to the chat. Chats
    are saved in the vault's "Chats" folder.
- After an analysis, the panel lists possible conflicts (with quotes and linked sources) and
  related papers (with links and open-access PDFs).

Papers sent from the extension are filed in the first project's "Papers" folder (the first
top-level folder A to Z, other than "Papers" and "Chats"), created if needed; with no project yet,
a top-level "Papers" folder. They appear in an open vault right away.

After changing files in `extension/`, click the reload icon on the extension's card in
`chrome://extensions`. Changes to `/panel` only need a panel reload.

## API

- `POST /api/documents/parse` — multipart PDF/text input and parser settings
- `POST /api/documents/analyze` — Gemini analysis plus graph/path generation
- `POST /api/contradictions` — page-verified claims compared across two to four papers
- `POST /api/recommendations` — background and related papers from OpenAlex
- `POST /api/explain` — contextual concept tutoring
- `POST /api/chat` — research chat grounded in the attached papers
- `POST /api/roadmap` — research roadmap (stages, concepts, real papers) for an idea, and revisions
- `POST /api/quiz` — short assessment generation
- `POST /api/evaluate` — deterministic scoring and mastery recommendation
- `POST /api/contradictions` — evidence-checked comparison of two stored papers
- `POST /api/synthesis` — evidence-linked themes across two to four project documents
- `POST /api/papers/citations` — refresh OpenAlex references for saved-paper citation links
- `GET /api/health` — service and provider configuration status
- `POST /api/ingest` — backwards-compatible generic ingestion endpoint
- `GET /api/voice/voices` — preset and ElevenLabs account voices
- `POST /api/voice/speak` — text to streamed MP3 (errors use the JSON envelope)

Every route returns `{ ok: true, data }` or `{ ok: false, error: { code, message } }`, except that `/api/voice/speak` returns audio on success.

## Testing and production checks

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run check
```

Tests use mocked provider responses and require no API keys. Fixtures cover Maxwell/vector-calculus material, humanities content, and scanned-page OCR output.

## Privacy and deployment

- PDF.js extraction is local to the application server.
- Mistral and Mathpix are never called without explicit user consent.
- Gemini receives normalized, section-aware excerpts—not the raw PDF and not the whole document on every follow-up.
- Credentials stay in backend environment variables.
- Documents, analyses, and mastery stay in browser IndexedDB.
- The server stores nothing between requests.

Do not expose this backend publicly without adding authentication, authorization, rate limiting, and a durable encrypted document store. Provider data-retention terms remain the deployer’s responsibility.

## Troubleshooting

- **Gemini is not configured:** set `GEMINI_API_KEY` in `.env.local` and restart Next.js.
- **OCR is not configured:** add the selected provider credentials or use Standard parsing.
- **Consent required:** check the external-processing control before Advanced OCR.
- **Low extraction quality:** use Automatic with consent or Advanced OCR; Mathpix is often preferable for dense equations.
