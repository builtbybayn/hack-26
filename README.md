# KnowBefore

KnowBefore turns academic PDFs into prerequisite knowledge graphs and personalized learning paths. It extracts a PDF locally with PDF.js, optionally uses consented Mistral or Mathpix OCR, asks Gemini for structured concept analysis, validates the graph deterministically, and stores learner mastery in browser IndexedDB.

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

## Install and run

Requires Node.js 22 or newer.

```bash
npm install
copy .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Standard PDF extraction works without provider keys. Gemini is required for concept analysis and tutoring.

## Environment configuration

| Variable                             | Purpose                                                       |
| ------------------------------------ | ------------------------------------------------------------- |
| `GEMINI_API_KEY`                     | Server-only Google AI Studio API key                          |
| `GEMINI_MODEL`                       | Supported Gemini model; defaults to `gemini-flash-latest`     |
| `MISTRAL_API_KEY`                    | Server-only Mistral OCR key                                   |
| `MISTRAL_OCR_MODEL`                  | Optional OCR model override; defaults to `mistral-ocr-latest` |
| `MATHPIX_APP_ID` / `MATHPIX_APP_KEY` | Server-only Mathpix credentials                               |
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

## PDF upload flow

1. Choose a PDF (maximum 25 MB).
2. Choose Automatic, Standard, or Advanced OCR.
3. If external OCR may run, select a provider and explicitly consent.
4. Analyze. PDF.js preserves pages, text positions, metadata, and page references. Automatic mode stays local unless quality is low **and** consent is checked.
5. Inspect the graph, dependency evidence, learning path, explanations, source pages, and quizzes.
6. Manual mastery changes and passed assessments persist in IndexedDB. Opening an explanation does not change mastery.

## Chrome extension development

`extension/` is a Manifest V3 side panel. It holds no secrets and almost no UI: the panel is the
app's `/panel` page in an iframe, so it shares the app's code, API, and browser storage (papers,
analyses, cached audio, reading positions). `extension/sidepanel.js` only bridges what needs
Chrome APIs: the active tab, the selection on it, and the paper it shows. The panel's flow is
in place; its visual design is provisional (**barebones build**).

1. Run `npm run dev` (the extension expects `http://localhost:3000`).
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select the repository's `extension` directory. Chrome 114 or newer is required.
4. Pin KnowBefore and click its icon to open the side panel.

The flow:

1. Open a paper: a PDF (for example an arXiv PDF) or an article page.
2. The panel shows **This tab** with **Use this PDF** or **Use this page**. Chrome asks once per
   site for access. PDFs are downloaded and parsed; pages are parsed from their main text.
3. The paper opens in five views: **Overview** (analyze with Gemini), **Prerequisites** (concepts
   to know first, mastery, explanations), **Explain** (bring over text selected on the page and
   hear it; the AI explanation of a passage is Track A's, shown as a placeholder), **Related**
   (Track B's recommendations), and **Listen** (read-aloud).
4. Switching tabs follows along: a paper used before reopens automatically.

Chrome's built-in PDF viewer doesn't share text selections with extensions; use the
Listen view or the paper's text instead. After changing files in `extension/`, click the reload
icon on the extension's card in `chrome://extensions`. Changes to `/panel` only need a panel reload.

## API

- `POST /api/documents/parse` — multipart PDF/text input and parser settings
- `POST /api/documents/analyze` — Gemini analysis plus graph/path generation
- `POST /api/explain` — contextual concept tutoring
- `POST /api/quiz` — short assessment generation
- `POST /api/evaluate` — deterministic scoring and mastery recommendation
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
