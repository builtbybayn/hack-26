"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  GraduationCap,
  Headphones,
  Highlighter,
  Info,
  Library,
  Link,
  LoaderCircle,
  Scale,
} from "lucide-react";
import { ContradictionPanel } from "@/features/contradictions/ContradictionPanel";
import { RecommendationsPanel } from "@/features/recommendations/RecommendationsPanel";
import { ListenButton } from "@/features/voice/ListenButton";
import { ReadAloudPanel } from "@/features/voice/ReadAloudPanel";
import { requestExplanation } from "@/lib/api/intelligence-client";
import { loadMastery, saveMastery, type DocumentRecord } from "@/lib/browser-store";
import type { MasteryLevel } from "@/types/intelligence";
import { PIPELINE_STEPS, type PipelineStepStatus } from "@/types/pipeline";
import type { Annotation, VaultEntry, VaultNote } from "@/types/vault";
import { useAnnotations } from "./reader/annotations-store";
import { KindIcon } from "./SidePanes";

type InsightTab =
  "overview" | "prerequisites" | "highlights" | "related" | "conflicts" | "listen" | "backlinks";

const PAPER_TABS: { id: InsightTab; label: string; icon: ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <Info size={18} /> },
  { id: "prerequisites", label: "Prerequisites", icon: <GraduationCap size={18} /> },
  { id: "highlights", label: "Highlights and comments", icon: <Highlighter size={18} /> },
  { id: "related", label: "Related papers", icon: <Library size={18} /> },
  { id: "conflicts", label: "Contradiction check", icon: <Scale size={18} /> },
  { id: "listen", label: "Listen", icon: <Headphones size={18} /> },
  { id: "backlinks", label: "Backlinks", icon: <Link size={18} /> },
];

const STATUS_TEXT: Record<PipelineStepStatus, string> = {
  pending: "Waiting",
  running: "Working…",
  done: "Done",
  skipped: "Skipped",
  failed: "Failed",
};

interface InsightsPaneProps {
  entry: VaultEntry | null;
  entries: VaultEntry[];
  record: DocumentRecord | null;
  running: boolean;
  onRunAnalysis: () => void;
  onOpenEntry: (entry: VaultEntry) => void;
  onOpenAnnotation: (annotation: Annotation) => void;
  onOpenPage: (pageNumber: number) => void;
}

/** The right sidebar: what we know about the open paper, or links to the open note. */
export function InsightsPane(props: InsightsPaneProps) {
  const { entry, record } = props;
  const [tab, setTab] = useState<InsightTab>("overview");
  const isPaper = entry?.kind === "paper";
  const tabs = isPaper ? PAPER_TABS : PAPER_TABS.filter((item) => item.id === "backlinks");
  const current = tabs.some((item) => item.id === tab) ? tab : tabs[0].id;

  return (
    <div className="insights">
      <div className="insights-tabs" role="tablist" aria-label="Insights">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className="clickable-icon"
            aria-selected={current === item.id}
            aria-label={item.label}
            title={item.label}
            onClick={() => setTab(item.id)}
          >
            {item.icon}
          </button>
        ))}
      </div>
      <div className="insights-content" role="tabpanel">
        {!entry ? (
          <p className="pane-empty">Open a paper to see its analysis here.</p>
        ) : current === "backlinks" ? (
          <Backlinks entry={entry} entries={props.entries} onOpen={props.onOpenEntry} />
        ) : !record ? (
          <p className="pane-empty">This paper is still loading.</p>
        ) : (
          <PaperInsights {...props} record={record} tab={current} />
        )}
      </div>
    </div>
  );
}

function PaperInsights({
  record,
  tab,
  running,
  onRunAnalysis,
  onOpenAnnotation,
  onOpenPage,
}: InsightsPaneProps & { record: DocumentRecord; tab: InsightTab }) {
  const { document, analysis } = record;
  const needsAnalysis = <NeedsAnalysis record={record} running={running} onRun={onRunAnalysis} />;
  switch (tab) {
    case "overview":
      return <Overview record={record} running={running} onRun={onRunAnalysis} />;
    case "prerequisites":
      return analysis ? <Prerequisites record={record} /> : needsAnalysis;
    case "highlights":
      return <Highlights documentId={record.id} onOpen={onOpenAnnotation} />;
    case "related":
      return analysis ? (
        <div className="insights-embed">
          <RecommendationsPanel
            key={`${record.id}-${record.recommendations ? "saved" : "none"}`}
            document={document}
            analysis={analysis}
            initialResult={record.recommendations ?? null}
          />
        </div>
      ) : (
        needsAnalysis
      );
    case "conflicts":
      return analysis ? (
        <div className="insights-embed">
          <ContradictionPanel
            key={`${record.id}-${record.contradictions ? "saved" : "none"}`}
            document={document}
            analysis={analysis}
            initialReport={record.contradictions ?? null}
          />
        </div>
      ) : (
        needsAnalysis
      );
    case "listen":
      return (
        <div className="insights-embed">
          <ReadAloudPanel key={record.id} document={document} onOpenPage={onOpenPage} />
        </div>
      );
    default:
      return null;
  }
}

function Overview({
  record,
  running,
  onRun,
}: {
  record: DocumentRecord;
  running: boolean;
  onRun: () => void;
}) {
  const { document, analysis, pipeline } = record;
  const incomplete =
    !pipeline ||
    Object.values(pipeline).some((step) => step.status === "failed" || step.status === "pending");
  return (
    <div className="insights-section">
      <h3 className="insights-title">{document.title ?? document.source.fileName}</h3>
      <p className="insights-muted">
        {document.metadata.pageCount ?? document.pages.length} pages ·{" "}
        {document.stats.words.toLocaleString()} words
      </p>
      {pipeline && (
        <ol className="pipeline-steps" aria-label="Analysis progress">
          {PIPELINE_STEPS.map(({ id, label }) => (
            <li key={id} data-status={pipeline[id].status}>
              <span className="pipeline-dot" aria-hidden>
                {pipeline[id].status === "running" && <LoaderCircle size={12} />}
              </span>
              <span className="pipeline-label">{label}</span>
              <span className="pipeline-status">{STATUS_TEXT[pipeline[id].status]}</span>
              {pipeline[id].message && <small>{pipeline[id].message}</small>}
            </li>
          ))}
        </ol>
      )}
      {(incomplete || !analysis) && !running && (
        <button type="button" className="mod-cta" onClick={onRun}>
          {pipeline ? "Finish the analysis" : "Analyze this paper"}
        </button>
      )}
      {analysis && (
        <>
          <h4 className="insights-heading">{analysis.understanding.subject}</h4>
          {analysis.understanding.learningObjectives.length > 0 && (
            <ul className="insights-list">
              {analysis.understanding.learningObjectives.slice(0, 4).map((objective) => (
                <li key={objective}>{objective}</li>
              ))}
            </ul>
          )}
          <div className="tag-list">
            {analysis.understanding.topics.slice(0, 12).map((topic) => (
              <span key={topic} className="tag">
                #{topic.replace(/\s+/g, "-")}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NeedsAnalysis({
  record,
  running,
  onRun,
}: {
  record: DocumentRecord;
  running: boolean;
  onRun: () => void;
}) {
  const failure = record.pipeline?.analysis.status === "failed" ? record.pipeline.analysis : null;
  return (
    <div className="insights-section">
      <p className="insights-muted">
        {running
          ? "The analysis is running. This fills in when it finishes."
          : failure
            ? `The analysis failed: ${failure.message}`
            : "This needs the paper's analysis first."}
      </p>
      {!running && (
        <button type="button" className="mod-cta" onClick={onRun}>
          {failure ? "Retry the analysis" : "Analyze this paper"}
        </button>
      )}
    </div>
  );
}

function Prerequisites({ record }: { record: DocumentRecord }) {
  const analysis = record.analysis!;
  const [mastery, setMastery] = useState<Record<string, MasteryLevel>>({});
  const [explanation, setExplanation] = useState<{ conceptId: string; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    void loadMastery().then((loaded) => active && setMastery(loaded));
    return () => {
      active = false;
    };
  }, []);

  const items = analysis.learningPath.slice(0, 12).flatMap((item) => {
    const concept = analysis.graph.concepts.find((entry) => entry.id === item.conceptId);
    return concept ? [{ item, concept }] : [];
  });

  const explain = async (conceptId: string) => {
    const concept = analysis.graph.concepts.find((entry) => entry.id === conceptId);
    if (!concept) return;
    setExplanation({ conceptId, text: "Asking Gemini…" });
    const result = await requestExplanation({
      document: record.document,
      concept,
      style: "beginner",
    });
    setExplanation({ conceptId, text: result.ok ? result.data.explanation : result.error.message });
  };

  return (
    <div className="insights-section">
      <p className="insights-muted">Concepts to know before reading, most important first.</p>
      <ol className="concept-list">
        {items.map(({ item, concept }) => (
          <li key={concept.id}>
            <div className="concept-row">
              <strong>{concept.name}</strong>
              <select
                className="dropdown"
                aria-label={`How well you know ${concept.name}`}
                value={mastery[concept.id] ?? "unknown"}
                onChange={(event) => {
                  const level = event.target.value as MasteryLevel;
                  setMastery((current) => ({ ...current, [concept.id]: level }));
                  void saveMastery(concept.id, level);
                }}
              >
                <option value="unknown">Not assessed</option>
                <option value="learning">Learning</option>
                <option value="mastered">Know it</option>
              </select>
            </div>
            <p className="concept-reason">
              {item.reason} · {concept.estimatedMinutes} min ·{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => void explain(concept.id)}
              >
                Explain
              </button>
            </p>
            {explanation?.conceptId === concept.id && (
              <div className="concept-explanation">
                <p>{explanation.text}</p>
                <ListenButton text={explanation.text} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Highlights({
  documentId,
  onOpen,
}: {
  documentId: string;
  onOpen: (annotation: Annotation) => void;
}) {
  const annotations = useAnnotations(documentId);
  if (!annotations) return <p className="pane-empty">Loading…</p>;
  if (!annotations.length)
    return (
      <p className="pane-empty">
        Select text in the paper to highlight it, comment on it, or ask the AI about it.
      </p>
    );
  return (
    <ul className="highlight-list">
      {annotations.map((annotation) => (
        <li key={annotation.id}>
          <button
            type="button"
            className="highlight-item"
            data-color={annotation.color}
            onClick={() => onOpen(annotation)}
          >
            <span className="highlight-quote">{annotation.quote}</span>
            {annotation.comment && <span className="highlight-comment">{annotation.comment}</span>}
            <small>p. {annotation.pageNumber}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Backlinks({
  entry,
  entries,
  onOpen,
}: {
  entry: VaultEntry;
  entries: VaultEntry[];
  onOpen: (entry: VaultEntry) => void;
}) {
  const pattern = new RegExp(
    `\\[\\[\\s*${entry.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\|[^\\]]*)?\\]\\]`,
    "i",
  );
  const linking = entries.filter(
    (candidate): candidate is VaultNote =>
      candidate.kind === "note" && candidate.id !== entry.id && pattern.test(candidate.body),
  );
  return (
    <div className="insights-section">
      <h4 className="insights-heading">Linked mentions</h4>
      {linking.length === 0 ? (
        <p className="insights-muted">
          No notes link here yet. Write <code>[[{entry.name}]]</code> in a note to link it.
        </p>
      ) : (
        <ul className="backlink-list">
          {linking.map((note) => (
            <li key={note.id}>
              <button type="button" className="bookmark-item" onClick={() => onOpen(note)}>
                <KindIcon entry={note} />
                <span>{note.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
