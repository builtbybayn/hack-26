"use client";

/**
 * Barebones extension side panel, loaded at /panel inside the extension. It follows the active
 * tab: "Analyze this paper" saves it to the vault and runs the full pipeline (analysis, related
 * papers, contradiction check), then the paper can be explored through six views. The flow and
 * wiring are what this establishes; the visual design is provisional.
 */
import { useEffect, useRef, useState } from "react";
import { AgentStatus } from "@/features/agent/AgentStatus";
import { ContradictionPanel } from "@/features/contradictions/ContradictionPanel";
import { RecommendationsPanel } from "@/features/recommendations/RecommendationsPanel";
import { ReadAloudPanel } from "@/features/voice/ReadAloudPanel";
import { parseDocument } from "@/lib/api/intelligence-client";
import {
  listDocumentRecords,
  loadMastery,
  saveMastery,
  type DocumentRecord,
} from "@/lib/browser-store";
import { runPaperPipeline } from "@/lib/paper-pipeline";
import type { ParsedDocument } from "@/types/ingestion";
import type { MasteryLevel } from "@/types/intelligence";
import {
  paperForUrl,
  rememberPaperForUrl,
  useExtensionBridge,
  type TabPaper,
  type TabSelection,
} from "./bridge";
import {
  ExplainView,
  NeedsAnalysis,
  NeedsPaper,
  OverviewView,
  PipelineProgress,
  PrerequisitesView,
} from "./PanelViews";
import "./extension-panel.css";

const VIEWS = [
  { id: "overview", label: "Overview" },
  { id: "prerequisites", label: "Prerequisites" },
  { id: "explain", label: "Explain" },
  { id: "related", label: "Related" },
  { id: "conflicts", label: "Conflicts" },
  { id: "listen", label: "Listen" },
] as const;
type View = (typeof VIEWS)[number]["id"];

export function ExtensionPanel() {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [picked, setPicked] = useState<{ id: string; forUrl: string | null } | null>(null);
  const [view, setView] = useState<View>("overview");
  const [selection, setSelection] = useState<TabSelection | null>(null);
  const [mastery, setMastery] = useState<Record<string, MasteryLevel>>({});
  const [runningId, setRunningId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pipelineAbort = useRef<AbortController | null>(null);

  const bridge = useExtensionBridge({
    onPaper: (paper) => void analyzeFromTab(paper),
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
      pipelineAbort.current?.abort();
    };
  }, []);

  const tab = bridge.tab;
  const tabUrl = tab?.url ?? null;
  // Which paper to show: a manual pick for this tab, else the paper analyzed from this tab before,
  // else (outside the extension) the most recent paper.
  const tabPaperId = tabUrl ? paperForUrl(tabUrl) : null;
  const activeId =
    (picked && picked.forUrl === tabUrl ? picked.id : null) ??
    (tabPaperId && records.some((entry) => entry.id === tabPaperId) ? tabPaperId : null) ??
    (tab ? null : (records[0]?.id ?? null));
  const record = records.find((entry) => entry.id === activeId) ?? null;
  const running = Boolean(record && runningId === record.id);

  const upsert = (updated: DocumentRecord) =>
    setRecords((current) => [updated, ...current.filter((entry) => entry.id !== updated.id)]);

  async function runPipeline(document: ParsedDocument, file?: { blob: Blob; fileName: string }) {
    pipelineAbort.current?.abort();
    const controller = new AbortController();
    pipelineAbort.current = controller;
    setRunningId(document.id);
    try {
      await runPaperPipeline(document, { file, signal: controller.signal, onUpdate: upsert });
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) {
        setError(caught instanceof Error ? caught.message : "The analysis stopped unexpectedly.");
      }
    } finally {
      setRunningId((current) => (current === document.id ? null : current));
    }
  }

  /** Parse the paper, then save it and run the whole pipeline on it. */
  async function analyzeFromTab(paper: TabPaper | File) {
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
    if (paper instanceof File) setPicked({ id: document.id, forUrl: tabUrl });
    else {
      rememberPaperForUrl(paper.url, document.id);
      setPicked(null);
    }
    setView("overview");
    await runPipeline(document, { blob: file, fileName: file.name });
  }

  async function updateMastery(conceptId: string, level: MasteryLevel) {
    setMastery((current) => ({ ...current, [conceptId]: level }));
    await saveMastery(conceptId, level);
  }

  const rerun = () => record && void runPipeline(record.document);
  const usingTabPaper = Boolean(record && tabPaperId === record.id);
  const pipelineIncomplete =
    record?.pipeline &&
    Object.values(record.pipeline).some(
      (step) => step.status !== "done" && step.status !== "skipped",
    );

  return (
    <main className="ext-panel">
      <header className="ext-header">
        <span className="eyebrow">KNOWBEFORE</span>
        <AgentStatus />
      </header>

      <section className="ext-card" aria-label="Current paper">
        {tab ? (
          <>
            <span className="ext-label">THIS TAB</span>
            <p className="ext-tab-title">{tab.title || "Untitled tab"}</p>
            {tab.kind === "unsupported" ? (
              <p className="ext-muted">Open a paper (a PDF or an article page) to analyze it.</p>
            ) : !usingTabPaper ? (
              <button
                type="button"
                className="primary"
                onClick={bridge.requestPaper}
                disabled={Boolean(busy) || bridge.pending === "kb:get-paper"}
              >
                Analyze this paper
              </button>
            ) : null}
          </>
        ) : (
          <p className="ext-muted">
            Open this panel from the KnowBefore extension to analyze the paper in your current tab.
            You can still choose or upload a paper below.
          </p>
        )}
        {(error || busy || bridge.pending === "kb:get-paper") && (
          <p className={error ? "ext-status failed" : "ext-status"} role="status">
            {error ?? busy ?? "Getting the paper from this tab…"}
          </p>
        )}
        {record && <PipelineProgress record={record} />}
        {record && pipelineIncomplete && !running && (
          <button type="button" className="secondary" onClick={rerun}>
            Finish the analysis
          </button>
        )}
        <details className="ext-library">
          <summary>
            {record
              ? `Paper: ${record.document.title ?? record.document.source.fileName}`
              : "Your vault"}
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
                if (file) void analyzeFromTab(file);
              }}
            />
            <span>Upload and analyze a file</span>
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
          <OverviewView record={record} running={running} onRun={rerun} />
        ) : view === "prerequisites" ? (
          <PrerequisitesView
            record={record}
            mastery={mastery}
            onMastery={updateMastery}
            running={running}
            onRun={rerun}
          />
        ) : view === "listen" ? (
          <ReadAloudPanel key={record.id} document={record.document} />
        ) : !record.analysis ? (
          <NeedsAnalysis record={record} running={running} onRun={rerun} />
        ) : view === "related" ? (
          <RecommendationsPanel
            // Remount when the pipeline saves results so they appear without a search.
            key={`${record.id}-${Boolean(record.recommendations)}`}
            document={record.document}
            analysis={record.analysis}
            initialResult={record.recommendations ?? null}
          />
        ) : (
          <ContradictionPanel
            key={`${record.id}-${Boolean(record.contradictions)}`}
            document={record.document}
            analysis={record.analysis}
            initialReport={record.contradictions ?? null}
          />
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
        <span className="ext-tag">Barebones build</span>
      </footer>
    </main>
  );
}
