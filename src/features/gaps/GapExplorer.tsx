"use client";

import { useEffect, useState } from "react";
import {
  listDocumentRecords,
  type DocumentRecord,
  type ResearchProject,
} from "@/lib/browser-store";
import type { ResearchGap } from "@/types/gaps";
import type { SynthesisEvidence } from "@/types/synthesis";
import { isSupportedFinding } from "@/lib/synthesis/evidence-status";
import { exploreGaps } from "./explore-gaps";
import styles from "./gaps.module.css";

export function GapExplorer({
  project,
  onUpdate,
}: {
  project: ResearchProject;
  onUpdate: (change: (current: ResearchProject) => ResearchProject) => Promise<boolean>;
}) {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const candidates = project.synthesis ? exploreGaps(project.synthesis) : [];
  const saved = project.gapIdeas ?? [];
  const dismissed = project.dismissedGapIds ?? [];
  const withheldFindings =
    project.synthesis?.findings.filter((finding) => !isSupportedFinding(finding)).length ?? 0;
  const suggestions = candidates.filter(
    (gap) => !saved.some((item) => item.id === gap.id) && !dismissed.includes(gap.id),
  );

  useEffect(() => {
    listDocumentRecords()
      .then(setRecords)
      .catch(() => setError("Source documents could not be loaded."));
  }, [project.documentIds]);

  async function change(id: string, update: (current: ResearchProject) => ResearchProject) {
    setBusy(id);
    setError("");
    try {
      if (!(await onUpdate(update))) setError("The project could not be updated in this browser.");
    } catch {
      setError("The project could not be updated in this browser.");
    } finally {
      setBusy("");
    }
  }

  function evidence(items: SynthesisEvidence[]) {
    return (
      <ul className={styles.evidence}>
        {items.map((item, index) => {
          const document = records.find((record) => record.id === item.documentId)?.document;
          const page = document?.pages.find((entry) => entry.pageNumber === item.pageNumber);
          return (
            <li key={`${item.documentId}-${item.pageNumber}-${index}`}>
              <details>
                <summary>
                  {document?.title ?? document?.source.fileName ?? "Document"}, page{" "}
                  {item.pageNumber}: “{item.quote}”
                </summary>
                <pre>{page?.text ?? "Stored page text unavailable."}</pre>
              </details>
            </li>
          );
        })}
      </ul>
    );
  }

  function card(gap: ResearchGap, isSaved: boolean) {
    return (
      <article key={gap.id} className={styles.card}>
        <span className="step">
          {gap.kind === "difference" ? "INCONSISTENT FINDINGS" : "OPEN QUESTION"}
        </span>
        <h3>{gap.theme}</h3>
        <p>{gap.question}</p>
        <p className={styles.meta}>
          Candidate to investigate · based on {gap.documentIds.length} of{" "}
          {project.documentIds.length} attached documents, not a field-wide search.
        </p>
        {isSaved && !candidates.some((item) => item.id === gap.id) && (
          <p className={styles.meta}>
            This saved idea is not supported by the current checked synthesis. Review its passages
            before using it.
          </p>
        )}
        <h4>Supporting passages</h4>
        {evidence(gap.evidence)}
        <h4>Evidence that may narrow this gap</h4>
        {gap.counterEvidence.length ? (
          evidence(gap.counterEvidence)
        ) : (
          <p className={styles.meta}>None identified in this project synthesis.</p>
        )}
        <p className={styles.meta}>Suggested searches: {gap.searchTerms.join(" · ")}</p>
        <div className={styles.actions}>
          {isSaved ? (
            <button
              disabled={!!busy}
              onClick={() =>
                void change(gap.id, (current) => ({
                  ...current,
                  gapIdeas: (current.gapIdeas ?? []).filter((item) => item.id !== gap.id),
                }))
              }
            >
              Remove saved idea
            </button>
          ) : (
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() =>
                void change(gap.id, (current) => ({
                  ...current,
                  gapIdeas: [...(current.gapIdeas ?? []), gap],
                }))
              }
            >
              Save idea
            </button>
          )}
          {!isSaved && (
            <button
              disabled={!!busy}
              onClick={() =>
                void change(gap.id, (current) => ({
                  ...current,
                  dismissedGapIds: [...(current.dismissedGapIds ?? []), gap.id],
                }))
              }
            >
              Dismiss
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="gaps-heading">
      <span className="step">RESEARCH GAP EXPLORER</span>
      <h2 id="gaps-heading">Questions to investigate</h2>
      <p>
        These are possible directions from the project synthesis. Check wider literature before
        treating one as a research gap.
      </p>
      {withheldFindings > 0 && (
        <p role="status" className={styles.meta}>
          {withheldFindings} synthesis finding{withheldFindings === 1 ? "" : "s"} excluded from
          suggestions and counter-evidence because their interpretation is unchecked or disputed.
          Regenerate the synthesis to recheck.
        </p>
      )}
      {project.synthesis?.warnings.map((warning) => (
        <p key={warning} className={styles.meta}>
          {warning}
        </p>
      ))}
      {!project.synthesis && <p>Generate a cross-paper synthesis first.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved.length > 0 && (
        <>
          <h3>Saved ideas</h3>
          {saved.map((gap) => card(gap, true))}
        </>
      )}
      {project.synthesis && (
        <>
          <h3>Suggestions</h3>
          {suggestions.map((gap) => card(gap, false))}
          {!suggestions.length && <p>No new suggestions remain from this synthesis.</p>}
        </>
      )}
      {dismissed.some((id) => candidates.some((gap) => gap.id === id)) && (
        <details className={styles.dismissed}>
          <summary>Dismissed suggestions</summary>
          <ul>
            {candidates
              .filter((gap) => dismissed.includes(gap.id))
              .map((gap) => (
                <li key={gap.id}>
                  {gap.theme}{" "}
                  <button
                    disabled={!!busy}
                    onClick={() =>
                      void change(gap.id, (current) => ({
                        ...current,
                        dismissedGapIds: (current.dismissedGapIds ?? []).filter(
                          (id) => id !== gap.id,
                        ),
                      }))
                    }
                  >
                    Restore
                  </button>
                </li>
              ))}
          </ul>
        </details>
      )}
    </section>
  );
}
