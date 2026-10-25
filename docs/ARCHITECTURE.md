# Architecture

One Next.js application. The UI, the API routes, and the shared server-side logic live in the
same repo and deploy together.

```mermaid
flowchart LR
  subgraph Browser
    Page["Pages<br/>src/app/**/page.tsx"]
    Feature["Features<br/>src/features/*"]
    Client["API clients + mocks<br/>src/lib/api"]
    Store["IndexedDB: documents, analyses, mastery<br/>src/lib/browser-store.ts"]
  end

  subgraph Server
    Route["API routes<br/>src/app/api/*/route.ts"]
    Ingestion["Ingestion pipeline<br/>src/lib/ingestion"]
    Intelligence["Gemini + graph validation<br/>src/lib/intelligence"]
  end

  Types["Contracts<br/>src/types"]

  Page --> Feature
  Feature --> Client
  Client -- "HTTP (FormData / JSON)" --> Route
  Route --> Ingestion
  Route --> Intelligence
  Feature --> Store
  Types -.-> Client
  Types -.-> Route
  Types -.-> Ingestion
```

## Layers

| Layer               | Location              | Runs in          | Responsibility                                                           |
| ------------------- | --------------------- | ---------------- | ------------------------------------------------------------------------ |
| Pages and layouts   | `src/app`             | Server or client | Composition and routing. Keep thin: arrange features and components.     |
| Components          | `src/components`      | Either           | Reusable, product-agnostic UI primitives. No data fetching.              |
| Features            | `src/features/<name>` | Mostly client    | A product capability's UI and state. Calls API clients.                  |
| API clients, mocks  | `src/lib/api`         | Browser-safe     | Typed `fetch` wrappers and mock payloads, one pair per endpoint.         |
| API routes          | `src/app/api`         | Server           | HTTP: parse the request, call shared logic, map errors to status.        |
| Shared server logic | `src/lib/<module>`    | Server only      | Ingestion, OCR providers, Gemini calls, and graph validation. Stateless. |
| Contracts           | `src/types`           | Both             | Types and constants shared across the network boundary.                  |

### The client/server boundary

- `src/lib/ingestion` starts with `import "server-only"`. Importing it from a Client Component
  fails the build. That is intentional.
- Frontend code talks to the server only through `src/lib/api/*-client.ts` and only imports
  types and constants from `src/types`.
- `src/types` must stay browser-safe: no Node APIs and no server imports.

## Ingestion pipeline

```
File / bytes → validateInput → PDF.js/text parser → quality gate → optional OCR → ParsedDocument
                (size, format)      (local first)       (consent)       (canonical)
```

**Public API** (`@/lib/ingestion`):

```ts
ingestFile(file: File): Promise<ParsedDocument>            // from FormData uploads
ingest({ fileName, mimeType, bytes }): Promise<ParsedDocument> // from any other source
IngestionError                                             // .code: IngestionErrorCode
```

Every expected failure throws `IngestionError` with a stable `code`. Anything else is a bug and
should surface as `INTERNAL_ERROR`.

**Using it from a new feature.** Do not write your own file reading or parsing. Either:

- **call the existing endpoint** from the browser with `uploadDocument(file)` from
  `@/lib/api/ingest-client`, or
- **call `ingest()` / `ingestFile()` server-side** from your own route or Server Component, then
  do your feature-specific work on the `ParsedDocument`:

```ts
// src/app/api/summarize/route.ts (hypothetical)
import { ingestFile } from "@/lib/ingestion";

const doc = await ingestFile(file);
const summary = await summarize(doc.sections); // feature logic works on the normalized result
```

### Extending ingestion

| Want to add…      | Do this                                                                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A new file format | Add an entry to `SUPPORTED_FORMATS` in `src/types/ingestion.ts`, then register a parser in `parsers.ts`. TypeScript fails until both exist. Add a test. |
| PDF / DOCX        | Same as above, using a parsing library chosen at that time. Parsers may be async.                                                                       |
| OCR               | Add a `DocumentParser` adapter under `src/lib/ingestion/ocr`; keep consent and normalization behavior.                                                  |
| AI extraction     | Extend `src/lib/intelligence`; never import the provider SDK from client code.                                                                          |
| Persistence       | Extend `src/lib/browser-store.ts`. Add server storage only if data must sync between browsers or devices.                                               |

PDF.js, Mistral OCR, Mathpix, Gemini intelligence, and browser IndexedDB storage are implemented.

## API contract

Every route returns the same envelope (`ApiResponse` in `src/types/api.ts`):

```jsonc
{ "ok": true,  "data": { /* endpoint-specific */ } }
{ "ok": false, "error": { "code": "STABLE_CODE", "message": "Human-readable." } }
```

Branch on `ok`, not on HTTP status. Status codes are still set correctly for tooling.

### `POST /api/ingest`

- **Request:** `multipart/form-data` with one field, `file`.
- **Accepts:** `.txt`, `.text`, `.md`, `.markdown`, and `.pdf` (by extension, falling back to MIME type). Maximum 25 MB.
- **Success (200):** `data` is a `ParsedDocument` (see `src/types/ingestion.ts`):

  | Field      | Meaning                                                                          |
  | ---------- | -------------------------------------------------------------------------------- |
  | `format`   | `"text"`, `"markdown"`, or `"pdf"`                                               |
  | `source`   | `{ fileName, mimeType, sizeBytes }` as uploaded                                  |
  | `title`    | First Markdown H1, else `null`                                                   |
  | `text`     | Full content, `\n` line endings, BOM removed                                     |
  | `pages`    | Page-preserving text, Markdown, equations, tables, and positions where available |
  | `sections` | Heading-aware content with original page references                              |
  | `metadata` | Canonical document metadata and page count                                       |
  | `stats`    | `{ characters, words, lines }`                                                   |
  | `warnings` | Non-fatal issues, e.g. an unclosed code fence                                    |
  | `parsedAt` | ISO timestamp                                                                    |

- **Errors:**

  | Status | `code`               | When                                   |
  | ------ | -------------------- | -------------------------------------- |
  | 400    | `INVALID_REQUEST`    | Body is not multipart form data        |
  | 400    | `NO_FILE`            | No `file` field                        |
  | 413    | `FILE_TOO_LARGE`     | Over 25 MB                             |
  | 415    | `UNSUPPORTED_FORMAT` | Not a supported extension or MIME type |
  | 422    | `EMPTY_FILE`         | Zero bytes or only whitespace          |
  | 422    | `DECODE_FAILED`      | Not valid UTF-8, or binary content     |
  | 422    | `PARSE_FAILED`       | A parser crashed unexpectedly          |
  | 500    | `INTERNAL_ERROR`     | Bug; logged server-side                |

  The client wrapper adds `NETWORK_ERROR` when the server can't be reached.

### Working against the contract before the backend exists

`src/lib/api/ingest-mock.ts` exports `MOCK_INGEST_SUCCESS` and `MOCK_INGEST_ERROR`. They are typed
against the real contract, and a unit test checks that the success mock matches what the real
pipeline produces. Label anything rendered from a mock as mock data so it is never mistaken for
real output.

### Adding a new endpoint

1. Define request/response types in `src/types/<domain>.ts` using `ApiResponse<Data, Codes>`.
2. Add a mock in `src/lib/api/<domain>-mock.ts` so frontend work can start immediately.
3. Implement the route in `src/app/api/<name>/route.ts`, keeping logic in `src/lib/<module>`.
4. Add a typed client in `src/lib/api/<domain>-client.ts`.
5. Document it in this file.

### PDF intelligence endpoints

| Endpoint                      | Contract and responsibility                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/documents/parse`   | Multipart `file`, `mode`, `ocrProvider`, and `allowExternalProcessing`; returns `{ document }`.                                               |
| `POST /api/documents/analyze` | JSON `{ document, mastery? }`; returns `{ analysis }`: validated graph and learning path.                                                     |
| `POST /api/explain`           | JSON `{ document, concept, style, question? }`; returns short explanation sections with verified page quotes or an explicit background label. |
| `POST /api/contradictions`    | JSON `{ documents: [first, second] }`; returns page-verified claim comparisons and independent Grok verdicts when configured.                 |
| `POST /api/synthesis`         | JSON `{ documents }` with two to four parsed documents; returns evidence-linked agreements, differences, and open questions.                  |
| `POST /api/brief/check`       | JSON `{ documents, finding }`; checks a revised brief finding against its cited source pages and returns refreshed interpretation labels.     |
| `POST /api/papers/citations`  | JSON `{ paperIds }` with one to twenty OpenAlex IDs; returns provider reference IDs for saved-paper citation links.                           |
| `POST /api/quiz`              | JSON `{ concept }`; returns a bounded quiz including its answer key.                                                                          |
| `POST /api/evaluate`          | JSON `{ quiz, answers }`; scores an explicit assessment. The only automatic mastery update path.                                              |
| `GET /api/health`             | Reports service health and whether each provider is configured, never its credential.                                                         |

Provider calls are bounded by request cancellation/timeouts. Gemini receives section-aware excerpts, then Zod validates the response before the deterministic graph engine merges duplicates, drops invalid references, repairs cycles, topologically sorts, and calculates downstream impact.

Concept source references require a quote found on the cited parsed page. References without a matching quote are removed and recorded in `graph.repairs`. The browser applies the same check when loading older saved analyses, so cached references receive the current validation without another model call.

Explanations use the concept's source pages as context. Each paper-grounded section carries a
page number and a short quote. The server checks that the quote appears on that page, then makes
one batched AI assessment of whether each cited claim is supported, contradicted, or unclear
from the surrounding passage. Invalid or unavailable assessment returns unclear. General
background has no citation or assessment. The UI shows each assessment as an AI check and opens
the PDF page when the original file is still selected, or stored page text after a reload.
Readers can correct a cited assessment. Corrections stay in the browser's IndexedDB, keyed by
document, claim, page, and quote; they can be removed or exported as labeled claim-passage JSON.
The workspace reports agreement on reviewed claims. `npm run eval:evidence` uses the same verifier
on a starter set or an exported set; see [EVIDENCE_EVALUATION.md](EVIDENCE_EVALUATION.md).

Critical review compares two stored documents on demand. Gemini proposes up to eight claim pairs;
the server checks each quote against its cited page and removes unsupported findings. Grok reviews
candidate conflicts independently through the xAI Responses API when `XAI_API_KEY` is set. A
conflict is confirmed only when both agree; otherwise it is marked unclear. Grok requests set
`store: false`. Each paper's review excerpt is capped at 20,000 characters and truncation is
reported to the user. The server stores no review results.

Project synthesis uses two to four attached analyzed documents. Gemini proposes up to twelve
agreements, differences, and open questions from a capped excerpt of each document. The server
checks every cited quote against its page and requires evidence from at least two documents for
agreements and differences. A separate batched AI check assesses each paper's contribution and
the combined finding. A finding is labeled supported only when every cited contribution is
supported; malformed or unavailable checks are labeled unclear. The browser saves the report
within its research project; the server remains stateless. Older saved reports display "not
checked" until regenerated.

The Research Brief is assembled in the browser from a project's saved synthesis and reading list.
Its question, notes, included findings, and finding summaries can be edited. Evidence stays attached
to each finding, along with any synthesis checks. Editing a summary clears its old assessment.
The user can check the revised claim on demand against the same cited pages; a checked summary is
saved with the new labels, and another edit invalidates them. The brief is saved on the project record
in IndexedDB. `/brief?project=<id>` reads the saved record from the same browser origin and provides
a print view; it does not call a model or store a copy on the server.

The Gap Explorer derives possible research questions from the project's open questions and
differences in the saved synthesis when the combined finding and every cited source are assessed
as supported. The same rule applies to agreements used as counter-evidence. Findings with missing,
unclear, or contradicted checks are withheld with an explanation in the UI. Previously saved ideas
remain visible but are flagged if the current checked synthesis does not support them. Each idea keeps its source passages, any same-theme agreement
that may narrow the gap, the reviewed document set, and suggested search terms. Saved and dismissed
ideas live in the project record. These are corpus-scoped hypotheses, not claims that a field-wide
gap exists.

The project paper graph combines attached analyzed documents and saved scholarly records. Its
agreement and disagreement links come only from synthesis findings whose combined and source
checks are supported. Withheld links are counted in the UI; older saved syntheses need regeneration
to supply these checks. Dashed topic links
are inferred from exact topic phrases in analyzed topics, titles, or abstracts. Directional
citation links use OpenAlex `referenced_works` only when both records are saved in the project.
Existing saved papers can refresh those references through `/api/papers/citations`; absent
references do not prove that no citation exists. The graph has an accessible paper and
relationship list alongside React Flow.

### Paper recommendations (Track B)

`POST /api/recommendations` accepts `{ document: ParsedDocument, analysis: DocumentAnalysis,
limit?: number }` (default 8, maximum 20). The analysis must belong to the supplied document.
It returns `{ recommendations, queries, warnings }` inside the usual `ApiResponse` envelope;
see `src/types/research.ts` and `src/lib/api/research-mock.ts` for the contract and mock.

The server-only `src/lib/research` searches OpenAlex for up to three foundational concepts
and one related-work query. Only concept names, subject, and topics are sent to OpenAlex.
It excludes the current paper by title or metadata DOI, filters book reviews, deduplicates
IDs/DOIs/titles, and ranks by term overlap, citation count, recency, and open-access
availability. Bibliographic fields always come from OpenAlex; optional AI reasons are
currently `null`. No Gemini key is needed. Empty results succeed with a warning. Provider failures return
`SEARCH_PROVIDER_ERROR` (502), quotas return `SEARCH_RATE_LIMITED` (429), and a request
timeout returns `REQUEST_TIMEOUT` (504). Provider calls have a 12-second timeout and the
route has a 20-second deadline. `OPENALEX_API_KEY` is optional and server-only; anonymous
requests share an IP usage budget. No recommendation state is kept on the server.

The browser uses `src/lib/api/research-client.ts`. `RecommendationsPanel` searches on demand
and displays Read first / Related groups, abstracts, citation counts, access links, and the query
trail. Users can save papers into browser projects from these cards. OpenAlex reference IDs are
included when available, so newly saved papers can form citation links without a second request.

### Storage: the browser owns state, the server is stateless

The server keeps nothing between requests. `src/lib/browser-store.ts` (IndexedDB) stores parsed
documents and their analyses keyed by the document's SHA-256 content hash, mastery records, and
research projects, and reader evidence corrections. Projects contain saved paper records, notes, and references to stored documents;
they do not duplicate parsed document content.
Clients send whatever a request needs (the document, a concept, a quiz) in the body. A restart loses
nothing, and re-uploading the same file reuses its stored analysis instead of calling Gemini again.

IndexedDB is per origin. An extension side panel that loads a page from this app shares the web
app's storage; a page bundled inside the extension would have its own. Learning paths are derived
from the stored mastery profile and the validated graph.

## When to create what

- **New feature folder (`src/features/<name>`):** a distinct user-facing capability with its own
  UI and state. Start here by default.
- **New shared module (`src/lib/<name>`):** logic that a second feature needs, or that is clearly
  infrastructure (parsing, AI calls, storage). Do not pre-share speculatively; move code here when
  the second consumer appears.
- **New component (`src/components`):** a UI primitive used by two or more features, with no
  feature-specific knowledge.
- **New type file (`src/types`):** a contract that crosses the client/server boundary or is shared
  by multiple features. Feature-internal types stay in the feature folder.

## Why one application

For a small team on a weekend, one app gives us one dev server, one deploy, shared types without
publishing packages, and refactors that touch both sides in one PR. Next.js API routes are enough
for request/response work.

**Consider splitting a service out only if:**

- a job runs longer than a request should (big PDFs, batch AI processing) and needs a queue/worker;
- a dependency needs a different runtime (e.g. a Python ML library);
- a component needs to scale or deploy independently.

Even then, keep the contracts in `src/types` and move the module behind an HTTP client, so callers
don't change.
