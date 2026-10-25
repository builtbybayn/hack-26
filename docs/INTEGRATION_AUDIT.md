# Research Core integration audit

Audited October 25, 2026. The main UI migration is retained, including its supplied Three.js
blob effects. Existing staged migrations and user files were preserved.

## Wiring repaired

- **Startup and routing:** render route children unconditionally, gate browser hydration in the
  client shell, and validate dynamic sections beneath Suspense. Internal navigation updates URLs.
  Legacy extension paper/page and note links resolve to the intended saved item, including items
  belonging to another project. Missing explicit sources never fall back to an unrelated paper.
- **Persistence:** workspace edits use an atomic IndexedDB read/modify/write transaction and a
  serialized service mutation queue. Refreshes arriving during an older load queue another read.
  Storage failures surface with retry. Drafts preserve unsaved typing across snapshot refreshes,
  save after a debounce, and flush pending edits when their view unmounts.
- **Uploads:** refresh the saved document record before starting its analysis pipeline. Show real
  parser/analysis errors and retries rather than simulated progress. Keep per-paper concept IDs
  so dependencies survive cross-paper imports.
- **Reader:** retain the shared PDF/text reader, annotations and selections; refresh the full paper
  record when analysis changes. Restore read-aloud and saved related-paper results. Annotation
  caches update only after persistence succeeds.
- **Assistant:** use the existing API activity store for the supplied blob's idle, researching,
  and error states. Keep its material, morphing, pointer effects, and disposal behavior. Render
  replies as Markdown, preserve queued requests while busy, validate source context, and send
  actual draft text when requesting draft review.
- **Existing tools:** expose stored literature collections, topic search, synthesis, briefs,
  gap ideas, paper graphs, and saved extension chats in Overview. Keep the extension panel and
  classic routes available. Replace the simulated extension preview with the real companion
  entry point and local quick notes.
- **Project creation:** finish prompt planning before activating the new project, avoiding an
  unmount partway through its roadmap request. Keep a recovery link if planning fails.
- **Maintenance:** repair the formatter's stylesheet path, resolve lint/type errors in migrated
  components, document the new layout/data ownership, and correct filter sizing.

## Validation

- `npm run check`: lint, generated route types, TypeScript, repository formatting, and all
  173 tests across 40 test files pass.
- `npm run build`: production compilation, type checking, and static page generation succeed.
  The sandboxed build stalled; the authorized build outside the sandbox completed.
- Browser: clean workspace startup, section navigation, Markdown note creation and reload,
  draft autosave and reload, split views, assistant controls, supplied blob active animation,
  and the local health endpoint. No startup hydration or instant-navigation errors remained.
- Production browser smoke test on port 3001: Overview and the restored assistant render with
  no captured console warnings or errors. The temporary production server was stopped afterward.
- Regression coverage includes upload-to-analysis ordering, queued refreshes, overlapping edits,
  recovery after failed writes/loads, project activation, source validation, legacy deep links,
  source ownership, missing sources, and split-panel state.

## Remaining verification limits

- Live model generation, OCR, speech playback, and installed Chrome-extension capture were not
  exercised end to end. The health endpoint reported Gemini and ElevenLabs configured, with
  Mistral and Mathpix unconfigured. Provider health does not establish successful generation.
- Semantic relationship discovery is an optional interface from the imported UI, not an
  implemented app API. Without `NEXT_PUBLIC_RESEARCH_API_BASE`, the graph uses explicit saved
  relationships and explains that semantic discovery requires a configured backend.
- The production build emits a PDF.js worker externalization warning from the existing worker
  URL pattern. Compilation succeeds; a real PDF's canvas rendering in a production server still
  needs a browser smoke test. Text rendering and parser logic have separate unit coverage.
- Browser smoke tests created an "Integration audit note" and "Integration audit draft" in the
  test browser's local workspace. These are labeled test content, not user research.
