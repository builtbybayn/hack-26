"use client";

import { useEffect, useRef, useState } from "react";
import { requestSynthesis, requestSynthesisCheck } from "@/lib/api/synthesis-client";
import {
  listDocumentRecords,
  type DocumentRecord,
  type ResearchProject,
} from "@/lib/browser-store";
import type { SynthesisReport } from "@/types/synthesis";
import { refreshReport } from "./refresh-report";
import styles from "./synthesis.module.css";

export function SynthesisPanel({
  project,
  onSave,
}: {
  project: ResearchProject;
  onSave: (report: SynthesisReport) => Promise<boolean>;
}) {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [report, setReport] = useState<SynthesisReport | null>(project.synthesis ?? null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    listDocumentRecords()
      .then((saved) => {
        const attached = project.documentIds.flatMap((id) =>
          saved.filter((item) => item.id === id),
        );
        setRecords(attached);
        setSelectedIds(attached.slice(0, 4).map((item) => item.id));
      })
      .catch(() => setError("Project documents could not be loaded."));
  }, [project.documentIds]);

  function toggle(id: string) {
    requestId.current += 1;
    setLoading(false);
    setChecking(false);
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function synthesize() {
    const documents = selectedIds
      .map((id) => records.find((item) => item.id === id)?.document)
      .filter((item) => item !== undefined);
    if (documents.length < 2 || documents.length > 4) return;
    const current = ++requestId.current;
    setLoading(true);
    setError("");
    const response = await requestSynthesis({ documents });
    if (current !== requestId.current) return;
    setLoading(false);
    if (!response.ok) return setError(response.error.message);
    setReport(response.data);
    try {
      if (!(await onSave(response.data)))
        setError("The synthesis was generated but could not be saved in this browser.");
    } catch {
      setError("The synthesis was generated but could not be saved in this browser.");
    }
  }

  async function recheck() {
    if (!report?.findings.length) return;
    const documents = report.documentIds.map(
      (id) => records.find((item) => item.id === id)?.document,
    );
    if (documents.some((item) => !item)) {
      setError("A source document used by this synthesis is missing from the project.");
      return;
    }
    const current = ++requestId.current;
    setLoading(true);
    setChecking(true);
    setError("");
    const response = await requestSynthesisCheck({
      documents: documents.filter((item) => item !== undefined),
      findings: report.findings,
    });
    if (current !== requestId.current) return;
    setLoading(false);
    setChecking(false);
    if (!response.ok) return setError(response.error.message);
    const updated = refreshReport(report, response.data);
    setReport(updated);
    try {
      if (!(await onSave(updated)))
        setError("The findings were checked but could not be saved in this browser.");
    } catch {
      setError("The findings were checked but could not be saved in this browser.");
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="synthesis-heading" aria-busy={loading}>
      <span className="step">CROSS-PAPER SYNTHESIS</span>
      <h2 id="synthesis-heading">Across the literature</h2>
      <p>
        Select two to four analyzed documents attached to this project. Their excerpts are sent to
        Gemini. Page quotes and the interpretation of each finding are checked before display.
      </p>
      <div className={styles.selection}>
        {records.map((item) => (
          <label key={item.id}>
            <input
              type="checkbox"
              checked={selectedIds.includes(item.id)}
              disabled={!selectedIds.includes(item.id) && selectedIds.length >= 4}
              onChange={() => toggle(item.id)}
            />
            {item.document.title ?? item.document.source.fileName}
          </label>
        ))}
      </div>
      {records.length < 2 && (
        <p>Add at least two analyzed documents to this project to synthesize them.</p>
      )}
      <button
        className="primary"
        disabled={loading || selectedIds.length < 2 || selectedIds.length > 4}
        onClick={synthesize}
      >
        {loading && !checking
          ? "Synthesizing…"
          : report
            ? "Regenerate synthesis"
            : "Synthesize papers"}
      </button>
      {!!report?.findings.length && (
        <button className="secondary" disabled={loading} onClick={() => void recheck()}>
          {checking ? "Checking saved findings…" : "Recheck saved findings"}
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {report && (
        <div className={styles.report}>
          <p className={styles.meta}>
            Synthesis of {report.documentIds.length} documents ·{" "}
            {new Date(report.createdAt).toLocaleString()}
          </p>
          {report.warnings.map((warning) => (
            <p key={warning} className={styles.meta}>
              {warning}
            </p>
          ))}
          {!report.findings.length && (
            <p>No verifiable cross-paper themes were found in the reviewed excerpts.</p>
          )}
          {report.findings.map((finding, index) => (
            <article key={`${finding.theme}-${index}`} className={styles.finding}>
              <span className="step">{finding.kind.replace("_", " ").toUpperCase()}</span>
              <h3>{finding.theme}</h3>
              <p>{finding.summary}</p>
              <p className={styles.assessment}>
                <strong>AI synthesis check: {finding.assessment?.verdict ?? "not checked"}.</strong>{" "}
                {finding.assessment?.reason ??
                  "Regenerate this saved synthesis to check its interpretation."}
              </p>
              <ul>
                {finding.evidence.map((item, evidenceIndex) => {
                  const document = records.find(
                    (record) => record.id === item.documentId,
                  )?.document;
                  const page = document?.pages.find(
                    (entry) => entry.pageNumber === item.pageNumber,
                  );
                  return (
                    <li key={`${item.documentId}-${item.pageNumber}-${evidenceIndex}`}>
                      <p className={styles.assessment}>
                        <strong>
                          AI source check: {item.assessment?.verdict ?? "not checked"}.
                        </strong>{" "}
                        {item.assessment?.reason ??
                          "This saved source has not been checked for interpretation."}
                      </p>
                      <details>
                        <summary>
                          {document?.title ?? document?.source.fileName ?? "Document"}, page{" "}
                          {item.pageNumber}: “{item.quote}”
                        </summary>
                        <pre>{page?.text ?? "Page text unavailable."}</pre>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
