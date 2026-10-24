"use client";

/**
 * TEMPORARY test harness for the Chrome extension's side panel (loaded at /panel). It exercises
 * real features (stored papers, parsing, Gemini analysis and explanations, read-aloud, and
 * reading a page selection aloud) in a narrow layout. Replace it with the designed panel later.
 */
import { useEffect, useState } from "react";
import { analyzeDocument, parseDocument, requestExplanation } from "@/lib/api/intelligence-client";
import { listDocumentRecords, saveDocument, type DocumentRecord } from "@/lib/browser-store";
import { ListenButton } from "@/features/voice/ListenButton";
import { ReadAloudPanel } from "@/features/voice/ReadAloudPanel";
import "./extension-panel.css";

interface PageSelection {
  text: string;
  title?: string;
}

export function ExtensionPanel() {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<PageSelection | null>(null);
  const [explanation, setExplanation] = useState<{ concept: string; text: string } | null>(null);

  const refresh = async (preferId?: string) => {
    const stored = await listDocumentRecords();
    setRecords(stored);
    setSelectedId((current) => preferId ?? current ?? stored[0]?.id ?? null);
  };

  useEffect(() => {
    let active = true;
    listDocumentRecords()
      .then((stored) => {
        if (!active) return;
        setRecords(stored);
        setSelectedId(stored[0]?.id ?? null);
      })
      .catch(() => active && setError("Couldn't open browser storage."));
    return () => {
      active = false;
    };
  }, []);

  // Text selected on the current tab arrives from the extension wrapper (sidepanel.js).
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.startsWith("chrome-extension://")) return;
      const data = event.data as { type?: string; text?: unknown; title?: unknown };
      if (data?.type !== "knowbefore:selection" || typeof data.text !== "string") return;
      setSelection({
        text: data.text,
        title: typeof data.title === "string" ? data.title : undefined,
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const record = records.find((entry) => entry.id === selectedId) ?? null;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy("Extracting the PDF…");
    const parsed = await parseDocument(file, { mode: "standard" });
    setBusy(null);
    if (!parsed.ok) {
      setError(parsed.error.message);
      return;
    }
    const existing = records.find((entry) => entry.id === parsed.data.document.id);
    await saveDocument(parsed.data.document, existing?.analysis ?? null);
    await refresh(parsed.data.document.id);
  };

  const analyze = async () => {
    if (!record) return;
    setError(null);
    setBusy("Analyzing with Gemini…");
    const result = await analyzeDocument({ document: record.document });
    setBusy(null);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    await saveDocument(record.document, result.data.analysis);
    await refresh(record.id);
  };

  const explain = async (conceptId: string) => {
    const concept = record?.analysis?.graph.concepts.find((entry) => entry.id === conceptId);
    if (!record || !concept) return;
    setExplanation({ concept: concept.name, text: "Asking Gemini…" });
    const result = await requestExplanation({
      document: record.document,
      concept,
      style: "beginner",
    });
    setExplanation({
      concept: concept.name,
      text: result.ok ? result.data.explanation : result.error.message,
    });
  };

  const concepts = record?.analysis
    ? record.analysis.learningPath
        .slice(0, 5)
        .map((item) => record.analysis!.graph.concepts.find((c) => c.id === item.conceptId))
        .filter((concept) => concept !== undefined)
    : [];

  return (
    <main className="ext-panel">
      <header className="ext-header">
        <span className="eyebrow">KNOWBEFORE</span>
        <span className="ext-temporary">Temporary test UI</span>
      </header>

      {selection && (
        <section className="ext-card" aria-labelledby="ext-selection">
          <div className="ext-card-heading">
            <h2 id="ext-selection">Selected text</h2>
            <button type="button" className="ext-link" onClick={() => setSelection(null)}>
              Clear
            </button>
          </div>
          {selection.title && <p className="ext-muted">From {selection.title}</p>}
          <blockquote className="ext-quote">{selection.text}</blockquote>
          <ListenButton text={selection.text} />
        </section>
      )}

      <section className="ext-card" aria-labelledby="ext-paper">
        <h2 id="ext-paper">Paper</h2>
        {records.length > 0 ? (
          <label className="ext-field">
            Stored papers
            <select
              value={selectedId ?? ""}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {records.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.document.title ?? entry.document.source.fileName}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="ext-muted">No papers yet. Upload one here or in the full app.</p>
        )}
        <label className="ext-upload">
          <input
            type="file"
            accept=".pdf,application/pdf,.md,.txt"
            onChange={(event) => void upload(event.target.files?.[0])}
          />
          <span>Upload a PDF</span>
        </label>
        {record && !record.analysis && (
          <button type="button" className="secondary" onClick={analyze} disabled={!!busy}>
            Analyze concepts (Gemini)
          </button>
        )}
        {(busy || error) && (
          <p className={error ? "ext-status failed" : "ext-status"} role="status">
            {error ?? busy}
          </p>
        )}
      </section>

      {concepts.length > 0 && (
        <section className="ext-card" aria-labelledby="ext-concepts">
          <h2 id="ext-concepts">Start with these concepts</h2>
          <ol className="ext-concepts">
            {concepts.map((concept) => (
              <li key={concept.id}>
                <span>{concept.name}</span>
                <button type="button" className="ext-link" onClick={() => void explain(concept.id)}>
                  Explain
                </button>
              </li>
            ))}
          </ol>
          {explanation && (
            <div className="ext-explanation">
              <strong>{explanation.concept}</strong>
              <p>{explanation.text}</p>
              <ListenButton text={explanation.text} />
            </div>
          )}
        </section>
      )}

      {record && <ReadAloudPanel key={record.id} document={record.document} />}
    </main>
  );
}
