# Track A: Analysis (prerequisites and contradictions)

Read [the track overview](README.md) first for the rules every track follows.

## Goal

Make the paper analysis trustworthy and add cross-paper reasoning:

1. **Prerequisite check:** improve the existing concept graph so it tells a reader, accurately and
   with evidence, what they need to know before this paper.
2. **Contradiction check:** given two or more papers, find claims that genuinely conflict, with
   quoted evidence from each paper, and say why apparent conflicts may not be real.
3. **Shared AI layer:** a single place every track uses to call Gemini and Grok.

Product principle from the white paper: _evidence before eloquence_. Every claim the model makes
must point to a page and quote, and model inference must be labeled as inference.

## You own

| Path                                                             | Status                                               |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| `src/lib/ai/`                                                    | **New.** Gemini and Grok helpers for all tracks      |
| `src/lib/intelligence/`                                          | Existing: graph analysis, prompts, validation, tutor |
| `src/lib/contradictions/`                                        | **New**                                              |
| `src/app/api/contradictions/route.ts`                            | **New**                                              |
| `src/types/contradictions.ts`                                    | **New** contract                                     |
| `src/lib/api/contradictions-client.ts`, `contradictions-mock.ts` | **New**                                              |
| `src/features/contradictions/`                                   | **New** UI component                                 |

You also review changes to `src/types/intelligence.ts`, since the other tracks read it.

## Step 1 (first hour): shared AI layer and contract

### `src/lib/ai/`

Gemini is called from two places today (`createGeminiGenerator` in `src/lib/intelligence/gemini.ts`
and `generateText` in `src/lib/intelligence/tutor.ts`), each building its own client. Consolidate:

```ts
// src/lib/ai/gemini.ts (server-only)
export async function generateText(prompt: string, options?: { maxOutputTokens?: number; temperature?: number; signal?: AbortSignal }): Promise<string>;
export async function generateJson<T>(prompt: string, schema: z.ZodType<T>, options?: { jsonSchema?: object; retries?: number; signal?: AbortSignal }): Promise<T>;

// src/lib/ai/grok.ts (server-only), same shape
export function isGrokConfigured(): boolean;
export async function generateJson<T>(...): Promise<T>;
```

- Missing key: throw `IntelligenceError("AI_NOT_CONFIGURED")`, never retry it. Retry only
  malformed output; the existing `analyzeDocument` loop shows the pattern.
- Grok: xAI's API is OpenAI-compatible, so plain `fetch` to its chat-completions endpoint is
  enough; no SDK needed. Confirm the current base URL and model name in xAI's docs and read
  the model from `XAI_MODEL`.
- Move the existing callers onto these helpers. Keep the existing tests passing; the
  `GenerateJson` injection in `analyzeDocument` is how tests avoid real model calls, so keep a
  way to inject a fake.

Merge this quickly. Track B uses `generateText` from it.

### Contract: `src/types/contradictions.ts` (proposal; adjust in your first PR)

```ts
import type { ApiResponse, CommonErrorCode } from "./api";
import type { ParsedDocument } from "./ingestion";
import type { DocumentAnalysis, IntelligenceErrorCode, SourceReference } from "./intelligence";

export interface Claim {
  documentId: string;
  text: string;
  /** Conditions the claim depends on: population, dataset, metric, setting. */
  conditions: string;
  source: SourceReference; // page number + short quote
}

export type Verdict = "contradiction" | "compatible" | "unclear";

export interface ContradictionFinding {
  id: string;
  topic: string;
  claims: [Claim, Claim]; // always from different documents
  explanation: string;
  /** Why the conflict may not be real: different cohorts, definitions, metrics, timeframes. */
  alternativeExplanations: string[];
  review: { gemini: Verdict; grok: Verdict | "not_run" };
}

export interface ContradictionRequest {
  documents: ParsedDocument[]; // 2–4 documents
  analyses?: DocumentAnalysis[]; // optional, same order; helps focus on shared concepts
}

export interface ContradictionReport {
  documentIds: string[];
  findings: ContradictionFinding[];
  comparedClaimCount: number;
  warnings: string[]; // e.g. "Grok not configured; single-model review only."
}

export type ContradictionResponse = ApiResponse<
  ContradictionReport,
  IntelligenceErrorCode | CommonErrorCode
>;
```

Add `MOCK_CONTRADICTION_REPORT` in `src/lib/api/contradictions-mock.ts`, typed against this.

## Step 2: contradiction check

`POST /api/contradictions`, body `ContradictionRequest`, returns `ContradictionResponse`.
Validate the body with zod; reuse `documentInputSchema` from `src/lib/intelligence/schema.ts`.

Suggested pipeline in `src/lib/contradictions/`:

1. **Extract claims per document (Gemini).** Findings and results only, each with its conditions
   and a page-anchored quote. Bound the count (for example, 25 per paper).
2. **Pair candidates (code, not model).** Only pair claims from different documents that share a
   topic or concept. This keeps cost bounded and avoids comparing everything with everything.
3. **Judge each pair (Gemini).** Verdict, explanation, alternative explanations.
4. **Second opinion (Grok).** Re-judge only the pairs Gemini called `contradiction`, independently
   (don't show it Gemini's answer). Report a finding as a contradiction only when both agree.
   If Grok isn't configured, set `grok: "not_run"` and add a warning; don't fail.
5. **Verify quotes (code).** Drop or flag any claim whose quote does not appear on the cited page
   of the source document. This is the main defense against invented evidence.

The white paper is explicit: a contradiction needs _comparable claims under comparable
conditions_. Prefer reporting "unclear, because the cohorts differ" over a confident false
contradiction.

## Step 3: prerequisite improvements

Pick in this order. Each is a small, separate PR.

1. **Quote verification for concepts.** Same check as above, applied to each concept's
   `sourceReferences`. Unverifiable quotes are dropped and noted in `graph.repairs`.
2. **Coverage warning for long papers.** `chunkDocument` sends at most 12 chunks of 12,000
   characters, so long papers are silently truncated. Report how much was analyzed, and consider
   sampling across the whole paper rather than only the start.
3. **Better sections.** The PDF parser currently makes one section per page
   (`buildSections` in `src/lib/ingestion/pdfjs-parser.ts`). Splitting on detected headings
   gives the model better context. Coordinate first: ingestion is shared.
4. **"Check my prerequisites" for a passage.** `POST /api/prerequisites` with
   `{ document, analysis, selectedText }`: which graph concepts this passage depends on and which
   the reader hasn't mastered. This is the extension's main feature, so design the
   request so the extension can call it directly.

Keep the deterministic graph engine (`src/lib/intelligence/graph.ts`) as the final authority on
graph validity; the model proposes, the code validates.

## Step 4: UI

`src/features/contradictions/ContradictionPanel.tsx`: lists stored documents
(`listDocumentRecords()` from `src/lib/browser-store.ts`), lets the user pick two or more, calls
the client, and shows each finding with both quotes, page numbers, the alternative explanations,
and which models agreed. Build against the mock first. Mount it with one line in
`DocumentIntelligence.tsx`.

## Definition of done

- [ ] `src/lib/ai/` merged; existing Gemini callers use it; tests pass with no API keys.
- [ ] `/api/contradictions` works with `curl` on two fixture documents; unit tests cover pairing,
      quote verification, and the Grok-missing path (with a fake model, no real calls).
- [ ] Every finding shows evidence from both papers, and every quote is verified to exist on its page.
- [ ] At least one prerequisite improvement merged with tests.
- [ ] Panel mounted in the main screen and working against the real route.
- [ ] `docs/ARCHITECTURE.md` lists the new endpoint; new env vars appended to `.env.example`.

## Out of scope

Searching for external papers (Track B), audio (Track C), changing the `ParsedDocument` shape
without agreement, server-side storage.
