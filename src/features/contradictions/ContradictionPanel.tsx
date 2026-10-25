"use client";

import { useEffect, useRef, useState } from "react";
import { requestCriticalReview } from "@/lib/api/contradictions-client";
import { listDocumentRecords, type DocumentRecord } from "@/lib/browser-store";
import type { ContradictionReport, ReviewClaim } from "@/types/contradictions";
import styles from "./contradictions.module.css";

export function ContradictionPanel({ documentId }: { documentId: string | null }) {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [firstId, setFirstId] = useState("");
  const [secondId, setSecondId] = useState("");
  const [report, setReport] = useState<ContradictionReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    listDocumentRecords()
      .then((saved) => {
        setRecords(saved);
        setFirstId((current) => current || documentId || saved[0]?.id || "");
        setSecondId((current) => current || saved.find((item) => item.id !== documentId)?.id || "");
      })
      .catch(() => setError("Stored documents could not be loaded."));
  }, [documentId]);

  async function review() {
    const first = records.find((item) => item.id === firstId);
    const second = records.find((item) => item.id === secondId);
    if (!first || !second || first.id === second.id) return;
    const current = ++requestId.current;
    setLoading(true);
    setError("");
    setReport(null);
    const result = await requestCriticalReview({ documents: [first.document, second.document] });
    if (current !== requestId.current) return;
    setLoading(false);
    if (result.ok) setReport(result.data);
    else setError(result.error.message);
  }

  function changeSelection(update: () => void) {
    requestId.current += 1;
    setLoading(false);
    setReport(null);
    update();
  }

  function evidence(claim: ReviewClaim) {
    const document = records.find((item) => item.id === claim.documentId)?.document;
    const page = document?.pages.find((item) => item.pageNumber === claim.pageNumber);
    return (
      <div key={claim.documentId} className={styles.claim}>
        <strong>{document?.title ?? document?.source.fileName ?? "Document"}</strong>
        <p>{claim.text}</p>
        {claim.conditions && <p className={styles.muted}>Conditions: {claim.conditions}</p>}
        <details>
          <summary>
            Page {claim.pageNumber}: “{claim.quote}”
          </summary>
          <pre>{page?.text ?? "Page text unavailable."}</pre>
        </details>
      </div>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="critical-review-heading" aria-busy={loading}>
      <span className="step">CRITICAL REVIEW</span>
      <h2 id="critical-review-heading">Compare two papers</h2>
      <p>
        Compare sends excerpts from both papers to Gemini. Candidate conflicts are also sent to Grok
        for an independent check when configured.
      </p>
      <div className={styles.controls}>
        <label>
          First document
          <select
            value={firstId}
            onChange={(event) => changeSelection(() => setFirstId(event.target.value))}
          >
            <option value="">Select</option>
            {records.map((item) => (
              <option key={item.id} value={item.id}>
                {item.document.title ?? item.document.source.fileName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Second document
          <select
            value={secondId}
            onChange={(event) => changeSelection(() => setSecondId(event.target.value))}
          >
            <option value="">Select</option>
            {records.map((item) => (
              <option key={item.id} value={item.id}>
                {item.document.title ?? item.document.source.fileName}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary"
          disabled={loading || !firstId || !secondId || firstId === secondId}
          onClick={review}
        >
          {loading ? "Reviewing…" : "Compare claims"}
        </button>
      </div>
      {records.length < 2 && <p>Analyze a second document to compare claims.</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <div role="status">
          {report.warnings.map((warning) => (
            <p key={warning} className={styles.muted}>
              {warning}
            </p>
          ))}
          {!report.findings.length && (
            <p>No verified comparable claims were found in the reviewed excerpts.</p>
          )}
          {report.findings.map((finding, index) => (
            <article key={`${finding.topic}-${index}`} className={styles.finding}>
              <div className={styles.heading}>
                <h3>{finding.topic}</h3>
                <strong>
                  {finding.verdict === "contradiction"
                    ? "Confirmed conflict"
                    : finding.verdict === "compatible"
                      ? "Compatible"
                      : "Unclear / unconfirmed"}
                </strong>
              </div>
              <div className={styles.claims}>{finding.claims.map(evidence)}</div>
              <p>{finding.explanation}</p>
              {finding.alternativeExplanations.length > 0 && (
                <>
                  <h4>Possible explanations</h4>
                  <ul>
                    {finding.alternativeExplanations.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              )}
              <p className={styles.muted}>
                Gemini: {finding.review.gemini} · Grok:{" "}
                {finding.review.grok === "not_run" ? "not run" : finding.review.grok}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
