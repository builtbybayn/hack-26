"use client";

import { useEffect, useRef, useState } from "react";
import { requestRecommendations } from "@/lib/api/research-client";
import type { ParsedDocument } from "@/types/ingestion";
import type { DocumentAnalysis } from "@/types/intelligence";
import type { RecommendationsResult } from "@/types/research";
import type { PaperRecord } from "@/types/research";
import styles from "./recommendations.module.css";

export function RecommendationsPanel({
  document,
  analysis,
  onSavePaper,
  savedPaperIds = [],
}: {
  document: ParsedDocument;
  analysis: DocumentAnalysis;
  onSavePaper?: (paper: PaperRecord) => Promise<void>;
  savedPaperIds?: string[];
}) {
  const [result, setResult] = useState<RecommendationsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function search() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError(null);
    try {
      const response = await requestRecommendations({ document, analysis }, current.signal);
      if (current.signal.aborted) return;
      if (response.ok) setResult(response.data);
      else setError(response.error.message);
    } catch {
      if (!current.signal.aborted) setError("The paper search failed. Please retry.");
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="recommendations-heading" aria-busy={loading}>
      <div className={styles.heading}>
        <div>
          <span className="step">PAPER RECOMMENDATIONS</span>
          <h2 id="recommendations-heading">Keep reading</h2>
          <p>
            Find background reading and related work in OpenAlex. Only concept names and topics are
            sent.
          </p>
        </div>
        <button className="secondary" onClick={search} disabled={loading}>
          {loading ? "Searching…" : result ? "Search again" : "Find papers"}
        </button>
      </div>
      {loading && <p role="status">Searching scholarly records…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          <div role="status">
            {result.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
          <div className={styles.groups}>
            {(["background", "related"] as const).map((kind) => {
              const papers = result.recommendations.filter((entry) => entry.kind === kind);
              return (
                <div key={kind}>
                  <h3>{kind === "background" ? "Read first" : "Related"}</h3>
                  {!papers.length && (
                    <p>No {kind === "background" ? "background" : "related"} papers found.</p>
                  )}
                  <ul className={styles.list}>
                    {papers.map(({ paper, reason, conceptIds }) => (
                      <li key={paper.id}>
                        <h4>
                          <a href={paper.url} target="_blank" rel="noopener noreferrer">
                            {paper.title}
                          </a>
                        </h4>
                        <p className={styles.metadata}>
                          {[
                            paper.authors.length ? paper.authors.join(", ") : "Authors unavailable",
                            paper.year,
                            paper.venue,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                        <p className={styles.metadata}>
                          {paper.citationCount === undefined
                            ? "Citations unavailable"
                            : `${paper.citationCount.toLocaleString()} citations`}
                          {" · "}
                          {paper.openAccessPdfUrl
                            ? "Open-access PDF available"
                            : "Open-access PDF unavailable"}
                        </p>
                        {!!conceptIds.length && (
                          <p>
                            Background for:{" "}
                            {conceptIds
                              .map(
                                (id) =>
                                  analysis.graph.concepts.find((concept) => concept.id === id)
                                    ?.name,
                              )
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        )}
                        {reason && <p>{reason}</p>}
                        {paper.abstract ? (
                          <p className={styles.abstract}>{paper.abstract}</p>
                        ) : (
                          <p className={styles.metadata}>Abstract not available.</p>
                        )}
                        <button
                          className="secondary"
                          disabled={!onSavePaper || savedPaperIds.includes(paper.id)}
                          onClick={() => void onSavePaper?.(paper)}
                        >
                          {savedPaperIds.includes(paper.id)
                            ? "Saved to project"
                            : onSavePaper
                              ? "Save to project"
                              : "Create or select a project to save"}
                        </button>
                        <p className={styles.links}>
                          <a href={paper.url} target="_blank" rel="noopener noreferrer">
                            OpenAlex record
                          </a>
                          {paper.openAccessPdfUrl && (
                            <a
                              href={paper.openAccessPdfUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Open-access PDF
                            </a>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <details className={styles.searches}>
            <summary>Searches performed</summary>
            <ul>
              {result.queries.map((query, index) => (
                <li key={index}>
                  {query.text} — {query.resultCount} records ({query.kind}, {query.provider})
                </li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
