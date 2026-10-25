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
  initialReport = null,
}: {
  document: ParsedDocument;
  analysis: DocumentAnalysis;
  /** A comparison run earlier (e.g. by the analyze pipeline), shown with its papers selected. */
  initialReport?: ContradictionReport | null;
}) {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialReport?.documentIds ?? [document.id],
  );
  const [report, setReport] = useState<ContradictionReport | null>(initialReport);
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
        const ids = new Set([current, ...stored].map((record) => record.id));
        setSelectedIds(
          (initialReport?.documentIds ?? [document.id]).filter((id) => ids.has(id)).slice(0, 4),
        );
      })
      .catch(() => active && setError("Could not load saved papers from this browser."));
    return () => {
      active = false;
    };
  }, [document, analysis, initialReport]);

  function toggle(id: string) {
    setReport(null);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id].slice(0, 4),
    );
  }

  async function compare() {
    const selected = selectedIds.flatMap((id) => records.find((record) => record.id === id) ?? []);
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
          {report.sources?.some((source) => source.kind === "literature") && (
            <p className="contradiction-warning">
              Includes published papers found by the related-papers search. Those are compared by
              their abstracts only.
            </p>
          )}
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
                    <ClaimSource
                      report={report}
                      records={records}
                      documentId={claim.documentId}
                      pageNumber={claim.source.pageNumber}
                    />
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

/** Names a claim's paper: a saved paper by title, a published one by title with a link. */
function ClaimSource({
  report,
  records,
  documentId,
  pageNumber,
}: {
  report: ContradictionReport;
  records: DocumentRecord[];
  documentId: string;
  pageNumber: number;
}) {
  const source = report.sources?.find((entry) => entry.documentId === documentId);
  if (source?.kind === "literature")
    return (
      <strong>
        {source.url ? (
          <a href={source.url} target="_blank" rel="noreferrer">
            {source.title}
          </a>
        ) : (
          source.title
        )}{" "}
        · Published paper, abstract
      </strong>
    );
  const title =
    records.find((record) => record.id === documentId)?.document.title ??
    source?.title ??
    documentId;
  return (
    <strong>
      {title} · Page {pageNumber}
    </strong>
  );
}
