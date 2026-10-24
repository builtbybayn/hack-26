"use client";

/**
 * Barebones extension side panel, loaded at /panel inside the extension. It follows the active
 * tab: use the paper the tab shows, then explore it through five views. The flow and wiring are
 * what this establishes; the visual design is provisional.
 */
import { useEffect, useState } from "react";
import { RecommendationsPanel } from "@/features/recommendations/RecommendationsPanel";
import { ReadAloudPanel } from "@/features/voice/ReadAloudPanel";
import { parseDocument } from "@/lib/api/intelligence-client";
import {
  listDocumentRecords,
  loadMastery,
  saveDocument,
  saveMastery,
  type DocumentRecord,
} from "@/lib/browser-store";
import type { DocumentAnalysis, MasteryLevel } from "@/types/intelligence";
import {
  paperForUrl,
  rememberPaperForUrl,
  useExtensionBridge,
  type TabPaper,
  type TabSelection,
} from "./bridge";
import { ExplainView, NeedsPaper, OverviewView, PrerequisitesView } from "./PanelViews";
import "./extension-panel.css";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "prerequisites", label: "Prerequisites" },
  { id: "explain", label: "Explain" },
  { id: "related", label: "Related" },
  { id: "listen", label: "Listen" },
] as const;
type View = (typeof VIEWS)[number]["id"];

export function ExtensionPanel() {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [picked, setPicked] = useState<{ id: string; forUrl: string | null } | null>(null);
  const [view, setView] = useState<View>("overview");
  const [selection, setSelection] = useState<TabSelection | null>(null);
  const [mastery, setMastery] = useState<Record<string, MasteryLevel>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bridge = useExtensionBridge({
    onPaper: (paper) => void ingest(paper),
    onSelection: (incoming) => {
      setSelection(incoming);
      setView("explain");
      setError(null);
    },
    onError: (_request, message) => setError(message),
  });

  useEffect(() => {
    let active = true;
    Promise.all([listDocumentRecords(), loadMastery()])
      .then(([stored, levels]) => {
        if (!active) return;
        setRecords(stored);
        setMastery(levels);
      })
      .catch(() => active && setError("Couldn't open browser storage."));
    return () => {
      active = false;
    };
  }, []);

  const tab = bridge.tab;
  const tabUrl = tab?.url ?? null;
  // Which paper to show: a manual pick for this tab, else the paper used from this tab before,
  // else (outside the extension) the most recent paper.
  const tabPaperId = tabUrl ? paperForUrl(tabUrl) : null;
  const activeId =
    (picked && picked.forUrl === tabUrl ? picked.id : null) ??
    (tabPaperId && records.some((entry) => entry.id === tabPaperId) ? tabPaperId : null) ??
    (tab ? null : (records[0]?.id ?? null));
  const record = records.find((entry) => entry.id === activeId) ?? null;

  async function ingest(paper: TabPaper | File) {
    setError(null);
    setBusy("Reading the paper…");
    const file =
      paper instanceof File
        ? paper
        : paper.kind === "pdf"
          ? new File([paper.bytes], paper.fileName, { type: "application/pdf" })
          : // Page text becomes Markdown titled with the tab's title, so the paper has a title.
            new File(
              [paper.title ? `# ${paper.title}\n\n${paper.text}` : paper.text],
              paper.fileName,
              { type: "text/markdown" },
            );
    const parsed = await parseDocument(file, { mode: "standard" });
    setBusy(null);
    if (!parsed.ok) {
      setError(parsed.error.message);
      return;
    }
    const document = parsed.data.document;
    const existing = (await listDocumentRecords()).find((entry) => entry.id === document.id);
    await saveDocument(document, existing?.analysis ?? null);
    if (!(paper instanceof File)) rememberPaperForUrl(paper.url, document.id);
    setRecords(await listDocumentRecords());
    setPicked(paper instanceof File ? { id: document.id, forUrl: tabUrl } : null);
    setView("overview");
  }

  async function saveAnalysis(analysis: DocumentAnalysis) {
    if (!record) return;
    await saveDocument(record.document, analysis);
    setRecords(await listDocumentRecords());
  }

  async function updateMastery(conceptId: string, level: MasteryLevel) {
    setMastery((current) => ({ ...current, [conceptId]: level }));
    await saveMastery(conceptId, level);
  }

  const usingTabPaper = Boolean(record && tabPaperId === record.id);

  return (
    <main className="ext-panel">
      <header className="ext-header">
        <span className="eyebrow">KNOWBEFORE</span>
        <span className="ext-tag">Barebones build</span>
      </header>

      <section className="ext-card" aria-label="Current paper">
        {tab ? (
          <>
            <span className="ext-label">THIS TAB</span>
            <p className="ext-tab-title">{tab.title || "Untitled tab"}</p>
            {tab.kind === "unsupported" ? (
              <p className="ext-muted">Open a paper (a PDF or an article page) to use it here.</p>
            ) : usingTabPaper ? (
              <p className="ext-muted">This tab&apos;s paper is loaded below.</p>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={bridge.requestPaper}
                disabled={Boolean(busy) || bridge.pending === "kb:get-paper"}
              >
                {tab.kind === "pdf" ? "Use this PDF" : "Use this page"}
              </button>
            )}
          </>
        ) : (
          <p className="ext-muted">
            Open this panel from the KnowBefore extension to use the paper in your current tab. You
            can still choose or upload a paper below.
          </p>
        )}
        {(error || busy || bridge.pending === "kb:get-paper") && (
          <p className={error ? "ext-status failed" : "ext-status"} role="status">
            {error ?? busy ?? "Getting the paper from this tab…"}
          </p>
        )}
        <details className="ext-library">
          <summary>
            {record
              ? `Paper: ${record.document.title ?? record.document.source.fileName}`
              : "Saved papers"}
          </summary>
          {records.length > 0 && (
            <label className="ext-field">
              Switch to a saved paper
              <select
                value={record?.id ?? ""}
                onChange={(event) => setPicked({ id: event.target.value, forUrl: tabUrl })}
              >
                {!record && <option value="">Choose…</option>}
                {records.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.document.title ?? entry.document.source.fileName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="ext-upload">
            <input
              type="file"
              accept=".pdf,application/pdf,.md,.txt"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void ingest(file);
              }}
            />
            <span>Upload a file</span>
          </label>
        </details>
      </section>

      <nav className="ext-views" role="tablist" aria-label="Paper views">
        {VIEWS.map((entry) => (
          <button
            key={entry.id}
            id={`view-${entry.id}`}
            type="button"
            role="tab"
            aria-selected={view === entry.id}
            aria-controls="ext-view"
            onClick={() => setView(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </nav>

      <div id="ext-view" className="ext-view" role="tabpanel" aria-labelledby={`view-${view}`}>
        {view === "explain" ? (
          <ExplainView
            selection={selection}
            canRequest={Boolean(tab && tab.kind !== "unsupported")}
            pending={bridge.pending === "kb:get-selection"}
            onRequest={bridge.requestSelection}
            onClear={() => setSelection(null)}
          />
        ) : !record ? (
          <NeedsPaper />
        ) : view === "overview" ? (
          <OverviewView record={record} onAnalyzed={saveAnalysis} />
        ) : view === "prerequisites" ? (
          <PrerequisitesView
            record={record}
            mastery={mastery}
            onMastery={updateMastery}
            onAnalyze={() => setView("overview")}
          />
        ) : view === "related" ? (
          record.analysis ? (
            <RecommendationsPanel
              key={record.id}
              document={record.document}
              analysis={record.analysis}
            />
          ) : (
            <OverviewView record={record} onAnalyzed={saveAnalysis} compact />
          )
        ) : (
          <ReadAloudPanel key={record.id} document={record.document} />
        )}
      </div>

      <footer className="ext-footer">
        <button
          type="button"
          className="ext-link"
          onClick={tab ? bridge.openApp : () => window.open("/", "_blank")}
        >
          Open full app
        </button>
      </footer>
    </main>
  );
}
