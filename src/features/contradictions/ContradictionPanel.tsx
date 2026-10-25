"use client";

import { useEffect, useState } from "react";
import { requestContradictions } from "@/lib/api/contradictions-client";
import { listDocumentRecords, type DocumentRecord } from "@/lib/browser-store";
import type { ContradictionReport } from "@/types/contradictions";
import type { ParsedDocument } from "@/types/ingestion";
import type { DocumentAnalysis } from "@/types/intelligence";

export function ContradictionPanel({
  document,
  analysis,
}: {
  document: ParsedDocument;
  analysis: DocumentAnalysis;
}) {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([document.id]);
  const [report, setReport] = useState<ContradictionReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    listDocumentRecords()
      .then((stored) => {
        if (!active) return;
        const current: DocumentRecord = {
          id: document.id,
          document,
          analysis,
          updatedAt: new Date().toISOString(),
        };
        setRecords([current, ...stored.filter((record) => record.id !== document.id)]);
        setSelectedIds([document.id]);
      })
      .catch(() => active && setError("Could not load saved papers from this browser."));
    return () => {
      active = false;
    };
  }, [document, analysis]);

  function toggle(id: string) {
    setReport(null);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, 4),
    );
  }

  async function compare() {
    const selected = selectedIds.map((id) => records.find((record) => record.id === id)!);
    setLoading(true);
    setError(null);
    setReport(null);
    try {
      const result = await requestContradictions({
        documents: selected.map((record) => record.document),
        ...(selected.every((record) => record.analysis)
          ? { analyses: selected.map((record) => record.analysis!) }
          : {}),
      });
      if (result.ok) setReport(result.data);
      else setError(result.error.message);
    } catch {
      setError("The comparison was cancelled.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="contradiction-panel" aria-labelledby="contradictions-title">
      <span className="step">05 · CROSS-PAPER CHECK</span>
      <h2 id="contradictions-title">Compare claims across papers</h2>
      <p>
        Select two to four papers saved in this browser. Only page-verified quotes are compared.
      </p>
      <div className="contradiction-documents">
        {records.map((record) => (
          <label key={record.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(record.id)}
              disabled={!selectedIds.includes(record.id) && selectedIds.length >= 4}
              onChange={() => toggle(record.id)}
            />
            <span>{record.document.title ?? record.document.source.fileName}</span>
          </label>
        ))}
      </div>
      {records.length < 2 && <p>Upload and analyze another paper to compare it with this one.</p>}
      <button className="primary" disabled={selectedIds.length < 2 || loading} onClick={compare}>
        {loading ? "Comparing…" : "Compare papers"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <div aria-live="polite" className="contradiction-results">
          <p>
            {report.comparedClaimCount} candidate pairs compared. {report.findings.length} possible
            conflicts found.
          </p>
          {report.warnings.map((warning) => (
            <p className="contradiction-warning" key={warning}>
              {warning}
            </p>
          ))}
          {report.findings.map((finding) => (
            <article key={finding.id} className="contradiction-finding">
              <span className="step">
                {finding.review.grok === "contradiction" ? "TWO-MODEL AGREEMENT" : "NEEDS REVIEW"}
              </span>
              <h3>{finding.topic}</h3>
              <p>{finding.explanation}</p>
              <div className="contradiction-claims">
                {finding.claims.map((claim) => (
                  <blockquote key={`${finding.id}-${claim.documentId}`}>
                    <strong>
                      {records.find((record) => record.id === claim.documentId)?.document.title ??
                        claim.documentId}{" "}
                      · Page {claim.source.pageNumber}
                    </strong>
                    <p>“{claim.source.quote}”</p>
                    <small>{claim.conditions}</small>
                  </blockquote>
                ))}
              </div>
              {finding.alternativeExplanations.length > 0 && (
                <p>
                  <strong>Check also:</strong> {finding.alternativeExplanations.join(" ")}
                </p>
              )}
              <small>
                Gemini: {finding.review.gemini}; Grok: {finding.review.grok.replace("_", " ")}
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
