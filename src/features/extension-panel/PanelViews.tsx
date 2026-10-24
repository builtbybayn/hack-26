"use client";

import { useState } from "react";
import { ListenButton } from "@/features/voice/ListenButton";
import { requestExplanation } from "@/lib/api/intelligence-client";
import type { DocumentRecord } from "@/lib/browser-store";
import type { MasteryLevel } from "@/types/intelligence";
import { PIPELINE_STEPS, type PipelineStepStatus } from "@/types/pipeline";
import type { TabSelection } from "./bridge";

const STATUS_TEXT: Record<PipelineStepStatus, string> = {
  pending: "Waiting",
  running: "Working…",
  done: "Done",
  skipped: "Skipped",
  failed: "Failed",
};

/** Progress of "Analyze this paper", step by step. */
export function PipelineProgress({ record }: { record: DocumentRecord }) {
  if (!record.pipeline) return null;
  return (
    <ol className="ext-pipeline" aria-label="Analysis progress">
      {PIPELINE_STEPS.map(({ id, label }) => {
        const step = record.pipeline![id];
        return (
          <li key={id} data-status={step.status}>
            <span className="ext-pipeline-label">{label}</span>
            <span className="ext-pipeline-status">{STATUS_TEXT[step.status]}</span>
            {step.message && <small>{step.message}</small>}
          </li>
        );
      })}
    </ol>
  );
}

export function NeedsPaper() {
  return (
    <p className="ext-muted">
      Analyze the paper in this tab, or choose a saved paper above, to see this view.
    </p>
  );
}

/** Shown by views that depend on the analysis when it isn't available. */
export function NeedsAnalysis({
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
    <div className="ext-callout">
      <p>
        {running
          ? "The analysis is running. This view fills in when it finishes."
          : failure
            ? `The analysis failed: ${failure.message}`
            : "This view needs the paper's analysis (Gemini)."}
      </p>
      {!running && (
        <button type="button" className="primary" onClick={onRun}>
          {failure ? "Retry analysis" : "Run analysis"}
        </button>
      )}
    </div>
  );
}

export function OverviewView({
  record,
  running,
  onRun,
}: {
  record: DocumentRecord;
  running: boolean;
  onRun: () => void;
}) {
  const { document, analysis } = record;
  return (
    <div className="ext-stack">
      <h2 className="ext-title">{document.title ?? document.source.fileName}</h2>
      <p className="ext-muted">
        {document.metadata.pageCount ?? document.pages.length} pages ·{" "}
        {document.stats.words.toLocaleString()} words
      </p>
      {analysis ? (
        <>
          <h3 className="ext-subhead">{analysis.understanding.subject}</h3>
          {analysis.understanding.learningObjectives[0] && (
            <p>{analysis.understanding.learningObjectives[0]}</p>
          )}
          <div className="chips">
            {analysis.understanding.topics.slice(0, 8).map((topic) => (
              <span key={topic}>{topic}</span>
            ))}
          </div>
        </>
      ) : (
        <NeedsAnalysis record={record} running={running} onRun={onRun} />
      )}
    </div>
  );
}

/** What to learn first, with mastery and explanations. */
export function PrerequisitesView({
  record,
  mastery,
  onMastery,
  running,
  onRun,
}: {
  record: DocumentRecord;
  mastery: Record<string, MasteryLevel>;
  onMastery: (conceptId: string, level: MasteryLevel) => void;
  running: boolean;
  onRun: () => void;
}) {
  const [explanation, setExplanation] = useState<{ conceptId: string; text: string } | null>(null);
  const { document, analysis } = record;
  if (!analysis) return <NeedsAnalysis record={record} running={running} onRun={onRun} />;

  const items = analysis.learningPath.slice(0, 8).flatMap((item) => {
    const concept = analysis.graph.concepts.find((entry) => entry.id === item.conceptId);
    return concept ? [{ item, concept }] : [];
  });

  const explain = async (conceptId: string) => {
    const concept = analysis.graph.concepts.find((entry) => entry.id === conceptId);
    if (!concept) return;
    setExplanation({ conceptId, text: "Asking Gemini…" });
    const result = await requestExplanation({ document, concept, style: "beginner" });
    setExplanation({
      conceptId,
      text: result.ok ? result.data.explanation : result.error.message,
    });
  };

  return (
    <div className="ext-stack">
      <p className="ext-muted">Concepts to know before reading, most important first.</p>
      <ol className="ext-concepts">
        {items.map(({ item, concept }) => (
          <li key={concept.id}>
            <div className="ext-concept-row">
              <strong>{concept.name}</strong>
              <select
                aria-label={`How well you know ${concept.name}`}
                value={mastery[concept.id] ?? "unknown"}
                onChange={(event) => onMastery(concept.id, event.target.value as MasteryLevel)}
              >
                <option value="unknown">Not assessed</option>
                <option value="learning">Learning</option>
                <option value="mastered">Know it</option>
              </select>
            </div>
            <small>
              {item.reason} · {concept.estimatedMinutes} min ·{" "}
              <button type="button" className="ext-link" onClick={() => void explain(concept.id)}>
                Explain
              </button>
            </small>
            {explanation?.conceptId === concept.id && (
              <div className="ext-explanation">
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

/** Text selected on the page: hear it now; AI explanation of a passage comes from Track A. */
export function ExplainView({
  selection,
  canRequest,
  pending,
  onRequest,
  onClear,
}: {
  selection: TabSelection | null;
  canRequest: boolean;
  pending: boolean;
  onRequest: () => void;
  onClear: () => void;
}) {
  return (
    <div className="ext-stack">
      <p className="ext-muted">
        Select a passage on the page, then bring it here to hear it or have it explained.
      </p>
      <button
        type="button"
        className="primary"
        onClick={onRequest}
        disabled={!canRequest || pending}
      >
        {pending ? "Reading your selection…" : "Get my selection"}
      </button>
      {!canRequest && (
        <p className="ext-muted">Available in the extension, on a web page or article.</p>
      )}
      {selection && (
        <>
          <blockquote className="ext-quote">{selection.text}</blockquote>
          <ListenButton text={selection.text} />
          <button type="button" className="ext-link" onClick={onClear}>
            Clear selection
          </button>
          <div className="ext-placeholder">
            <strong>Explain this passage</strong>
            <p>
              Coming next: an explanation of the selected passage, with the prerequisites it depends
              on and page references.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
