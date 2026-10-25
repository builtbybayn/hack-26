"use client";

import { useState } from "react";
import { ListenButton } from "@/features/voice/ListenButton";
import { analyzeDocument, requestExplanation } from "@/lib/api/intelligence-client";
import type { DocumentRecord } from "@/lib/browser-store";
import type { DocumentAnalysis, ExplainResult, MasteryLevel } from "@/types/intelligence";
import type { TabSelection } from "./bridge";

export function NeedsPaper() {
  return (
    <p className="ext-muted">
      Use the paper in this tab, or choose a saved paper above, to see this view.
    </p>
  );
}

/** Paper facts, and Gemini analysis on request (it costs a model call). */
export function OverviewView({
  record,
  onAnalyzed,
  compact = false,
}: {
  record: DocumentRecord;
  onAnalyzed: (analysis: DocumentAnalysis) => Promise<void>;
  /** Only the analyze prompt, for views that need an analysis first. */
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { document, analysis } = record;

  const analyze = async () => {
    setBusy(true);
    setError(null);
    const result = await analyzeDocument({ document });
    setBusy(false);
    if (result.ok) await onAnalyzed(result.data.analysis);
    else setError(result.error.message);
  };

  return (
    <div className="ext-stack">
      {!compact && (
        <>
          <h2 className="ext-title">{document.title ?? document.source.fileName}</h2>
          <p className="ext-muted">
            {document.metadata.pageCount ?? document.pages.length} pages ·{" "}
            {document.stats.words.toLocaleString()} words
          </p>
        </>
      )}
      {analysis ? (
        !compact && (
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
        )
      ) : (
        <div className="ext-callout">
          <p>
            Analyze the paper to find its concepts and prerequisites. This uses Gemini and the
            server&apos;s <code>GEMINI_API_KEY</code>.
          </p>
          <button type="button" className="primary" onClick={analyze} disabled={busy}>
            {busy ? "Analyzing…" : "Analyze with Gemini"}
          </button>
          {error && (
            <p className="ext-status failed" role="status">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/** What to learn first, with mastery and explanations. Track A is improving the detection. */
export function PrerequisitesView({
  record,
  mastery,
  onMastery,
  onAnalyze,
}: {
  record: DocumentRecord;
  mastery: Record<string, MasteryLevel>;
  onMastery: (conceptId: string, level: MasteryLevel) => void;
  onAnalyze: () => void;
}) {
  const [explanation, setExplanation] = useState<{
    conceptId: string;
    result: ExplainResult | string;
  } | null>(null);
  const { document, analysis } = record;
  if (!analysis) {
    return (
      <div className="ext-callout">
        <p>Prerequisites come from the paper&apos;s analysis.</p>
        <button type="button" className="secondary" onClick={onAnalyze}>
          Go to Overview to analyze
        </button>
      </div>
    );
  }

  const items = analysis.learningPath.slice(0, 8).flatMap((item) => {
    const concept = analysis.graph.concepts.find((entry) => entry.id === item.conceptId);
    return concept ? [{ item, concept }] : [];
  });

  const explain = async (conceptId: string) => {
    const concept = analysis.graph.concepts.find((entry) => entry.id === conceptId);
    if (!concept) return;
    setExplanation({ conceptId, result: "Asking Gemini…" });
    const result = await requestExplanation({ document, concept, style: "beginner" });
    setExplanation({
      conceptId,
      result: result.ok ? result.data : result.error.message,
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
                {typeof explanation.result === "string" ? (
                  <p>{explanation.result}</p>
                ) : (
                  <>
                    {explanation.result.sections.map((section, index) => (
                      <div key={index}>
                        <p>{section.text}</p>
                        <small>
                          {section.sourceReference
                            ? `Page ${section.sourceReference.pageNumber}: “${section.sourceReference.quote}” · AI check: ${section.evidence?.verdict ?? "unclear"}`
                            : "Background or inference · no direct source quote"}
                        </small>
                      </div>
                    ))}
                    <ListenButton
                      text={explanation.result.sections.map((section) => section.text).join(" ")}
                    />
                  </>
                )}
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
              Coming from Track A: an explanation of the selected passage, with the prerequisites it
              depends on and page references.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
