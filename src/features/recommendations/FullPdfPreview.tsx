"use client";

import { useEffect, useRef, useState } from "react";
import { requestPdfStudyPreview } from "@/lib/api/paper-preview-client";
import { MAX_FILE_BYTES } from "@/types/ingestion";
import { STUDY_FIELDS, type PdfStudyPreview } from "@/types/paper-preview";
import styles from "./recommendations.module.css";

export function FullPdfPreview() {
  const [result, setResult] = useState<PdfStudyPreview | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );

  async function analyze(file: File) {
    controller.current?.abort();
    setResult(null);
    setError(null);
    setLoading(false);
    setPdfUrl(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("Choose a PDF smaller than 25 MB.");
      return;
    }
    // shortcut: PDF page links last for this tab; persist the file for reloadable citations.
    setPdfUrl(URL.createObjectURL(file));
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    try {
      const response = await requestPdfStudyPreview(file, current.signal);
      if (current.signal.aborted) return;
      if (response.ok) setResult(response.data);
      else setError(response.error.message);
    } catch {
      if (!current.signal.aborted) setError("The PDF analysis was interrupted.");
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }

  return (
    <details className={styles.pdfPreview}>
      <summary>Analyze full PDF with page citations</summary>
      <p>
        Upload this paper&apos;s PDF. Its extracted text is sent to Gemini for analysis. Check that
        the file matches the record above.
      </p>
      <label>
        PDF file
        <input
          type="file"
          accept=".pdf,application/pdf"
          disabled={loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void analyze(file);
          }}
        />
      </label>
      {loading && <p role="status">Reading and checking the PDF…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div>
          <p className={styles.metadata}>
            {result.fileName} · {result.pageCount} pages · Quotes checked against extracted PDF
            pages
          </p>
          <p className={styles.metadata}>
            PDF page links remain available while this card is open.
          </p>
          <dl className={styles.pdfFields}>
            {STUDY_FIELDS.map((field) => {
              const citation = result.fields[field];
              return (
                <div key={field}>
                  <dt>{field === "sample" ? "Sample or data" : field}</dt>
                  <dd>
                    {citation && pdfUrl ? (
                      <>
                        “{citation.quote}”{" "}
                        <a
                          href={`${pdfUrl}#page=${citation.pageNumber}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          PDF p. {citation.pageNumber}
                        </a>
                      </>
                    ) : (
                      "No verified excerpt returned."
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
          {result.warnings.map((warning) => (
            <p key={warning} className={styles.metadata}>
              {warning}
            </p>
          ))}
        </div>
      )}
    </details>
  );
}
