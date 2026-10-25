# Research features roadmap

This roadmap builds on the current Next.js app, its browser IndexedDB store, the OpenAlex
recommendations feature, and document-level source references. The server stays stateless; new
research data belongs in the browser unless a recorded decision changes that rule.

Core versions of the listed features are implemented. Gap suggestions are limited to a project's
reviewed corpus. The paper graph includes citation edges where OpenAlex supplies reference IDs for
saved papers. Gap suggestions and synthesis-based graph relationships now require supported
claim and source checks; older syntheses need regeneration before they contribute those links.
Live provider and print behavior still need validation with configured credentials
and real documents.

## Recommended order

| Phase                       | Features                                         | Why this order                                                                                 |
| --------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| 0. Foundation               | Data-first paper preview; project organization   | Improve the existing paper cards, then provide a home for saved papers and notes.              |
| 1. Evidence and review      | Source-linked explanations; Grok critical review | Strengthen traceability, then surface the existing contradiction work as a usable workflow.    |
| 2. Literature understanding | Cross-paper synthesis; Research Brief            | Synthesis needs saved papers and verified evidence; the brief packages that synthesis.         |
| 3. Exploration              | Research Gap Explorer; paper knowledge graph     | Build these on the saved corpus and synthesis links, once the underlying evidence is reliable. |

Work in small increments. Each phase can ship independently; don’t wait for the entire roadmap.

## Phase 0 — Make recommendations useful and saveable (P0)

### Data-first paper preview

- Extend recommendation cards to put the abstract, year, venue, authors, citation count, and open-access status where users can scan them before opening the provider record.
- Keep provider metadata authoritative; show an explicit unavailable state for missing abstracts or fields.
- Add a paper detail/preview view only if the card becomes too long. Do not download or parse PDFs as part of this step.
- Done when a user can judge relevance and access status without opening another site, and missing metadata is clear.

### Research project organization

- Add browser-side projects that group saved papers and user notes. A project should have an id, name, timestamps, saved paper references, and notes; use stable paper ids/DOIs where available.
- Add project CRUD and save/remove-paper actions in a focused `src/features/projects` UI; persist in `src/lib/browser-store.ts` and bump the IndexedDB version with a non-destructive upgrade.
- Decide how existing parsed documents relate to a project: allow attaching them by document id; do not duplicate PDF bytes or parsed content.
- Handle deleted/missing documents and duplicate papers gracefully. Keep data in the browser and explain that it is per browser origin.
- Done when projects, notes, and saved papers survive reloads and can be edited or removed without losing unrelated documents or mastery.

## Phase 1 — Make answers verifiable and critical review accessible (P0/P1)

### Source-linked explanations

- The tutor already receives document pages and returns `sourceReferences`; show those references with the explanation, including page and quote where available.
- Verify quotes against the cited page before presenting them as direct evidence. Label background knowledge or inference clearly, and don’t imply it came from the paper.
- Keep the existing `ExplainResult` API contract if sufficient; update types, mock, consumer, and architecture docs together if the response must change.
- Done when every paper-grounded explanation has clickable page references and unsupported background is identified as such.

### Grok critical review UI

- First inspect whether the planned contradiction endpoint and server logic exist; current track docs describe them, but planning text alone is not implementation.
- If absent, implement a validated, bounded cross-paper review contract and route, with evidence quotes verified against the source pages. Use Grok as an independent review of candidate conflicts, not as a source of facts.
- Keep Grok optional. If it is not configured or fails, show single-model review status and continue with a clear warning.
- Add a `src/features/contradictions` panel to select stored papers and inspect claims, conditions, evidence, verdicts, and alternative explanations.
- Done when users can compare at least two saved papers, inspect evidence from both, and see exactly which model reviews ran.

## Phase 2 — Explain a collection and produce an output (P1)

### Cross-paper synthesis

- Let users choose papers within a project and request a synthesis of shared themes, agreements, differences, and unresolved questions.
- Ground each claim in verified page-level references from the selected papers. Separate evidence from model interpretation and preserve disagreement rather than flattening it.
- Bound paper count and input size; report omissions or incomplete coverage. Store the result in the project so it can be revisited.
- Done when a synthesis claim can be traced back to one or more source pages, and users can see which papers were included.

### Research Brief generator

- Generate a concise, editable brief from a project’s papers and synthesis: research question, key findings, points of disagreement, evidence, and open questions.
- Reuse synthesis and citations rather than making a second ungrounded summary call. Let users edit and save the brief locally, with source links preserved.
- Start with an in-app view and print-friendly output; add export formats only if needed.
- Done when the brief can be revised, saved to its project, and every factual statement retains its source references.

## Phase 3 — Explore what the literature does not settle (P2)

### Research Gap Explorer

- Suggest candidate gaps only from a selected project corpus and clearly label them as hypotheses to investigate, not established gaps in the field.
- For each suggestion, show supporting evidence, counter-evidence, corpus coverage, and suggested search terms. Allow users to dismiss or save a candidate to project notes.
- Prefer deterministic signals from Phase 2 synthesis (inconsistent findings, unaddressed populations/methods, explicit limitations) before asking a model to phrase candidates.
- Done when every proposed gap explains its evidence and limits, and users can verify it before acting on it.

### Knowledge graph connecting papers

- Add a project-level graph whose nodes are papers and whose edges have explicit relationship types such as shared topic, cites/ cited-by when provider data supports it, agreement, or disagreement.
- Store the evidence and provenance for each edge. Do not infer a citation edge from text similarity; keep inferred links visually distinct and explain their basis.
- Reuse the existing React Flow dependency if it fits. Provide a keyboard-usable paper list as an alternative to the graph view.
- Done when graph links navigate to the paper and show why the connection exists; filtering and list navigation remain usable on mobile.

## Shared implementation rules

- Keep feature UI under `src/features/<name>`, shared contracts under `src/types`, and provider/model logic server-only under `src/lib` and API routes.
- All routes use the existing `ApiResponse` envelope and request validation. Keep API clients and mocks in sync with contract changes.
- Keep API keys server-only; provider failures and missing optional keys must have clear user-facing states.
- Add tests for shared logic, quote verification, storage upgrades, and model/provider failure paths. Do not make tests call external providers.
- Read `docs/ARCHITECTURE.md` and `docs/DESIGN.md` before changing boundaries or UI; record any decision that changes storage or providers in `docs/DECISIONS.md`.

## First implementation slice

1. Improve recommendation cards using fields already returned by OpenAlex.
2. Add project and saved-paper storage with a safe IndexedDB version upgrade.
3. Add save-to-project controls to recommendation cards.
4. Surface verified tutor citations in the existing explanation panel.

This slice makes the current app more useful while establishing the saved corpus needed by later
features. It avoids adding services, databases, or dependencies.
