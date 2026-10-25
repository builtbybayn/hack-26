"use client";

import { useEffect, useRef, useState } from "react";
import { requestRecommendations } from "@/lib/api/research-client";
import type { ParsedDocument } from "@/types/ingestion";
import type { DocumentAnalysis } from "@/types/intelligence";
import type {
  RecommendationsRequest,
  RecommendationsResult,
  SavedTopicSearch,
} from "@/types/research";
import type { PaperRecord } from "@/types/research";
import styles from "./recommendations.module.css";

export function RecommendationsPanel({
  document,
  analysis,
  initialResult = null,
  onSavePaper,
  onSaveSearch,
  history = [],
  savedPaperIds = [],
}: {
  document?: ParsedDocument;
  analysis?: DocumentAnalysis;
  /** Results found earlier (e.g. by the analyze pipeline), shown without searching again. */
  initialResult?: RecommendationsResult | null;
  onSavePaper?: (paper: PaperRecord) => Promise<void>;
  onSaveSearch?: (topic: string, result: RecommendationsResult) => Promise<boolean>;
  history?: SavedTopicSearch[];
  savedPaperIds?: string[];
}) {
  const [result, setResult] = useState<RecommendationsResult | null>(initialResult);
  const [topic, setTopic] = useState("");
  const [topicResult, setTopicResult] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  async function search(input: RecommendationsRequest) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError(null);
    setResult(null);
    setSavedAt(null);
    try {
      const response = await requestRecommendations(input, current.signal);
      if (current.signal.aborted) return;
      if (response.ok) {
        setResult(response.data);
        setTopicResult("topic" in input);
        if ("topic" in input && onSaveSearch) {
          const saved = await onSaveSearch(input.topic, response.data);
          if (!saved && !current.signal.aborted)
            setError("Results loaded, but this search could not be saved to the project.");
        }
      } else setError(response.error.message);
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
          <span className="step">PAPER DISCOVERY</span>
          <h2 id="recommendations-heading">Find papers</h2>
          <p>
            Search real OpenAlex records by topic.
            {onSavePaper
              ? " Searches and selected papers are saved to your project."
              : " Select a project to save searches and papers."}
          </p>
        </div>
      </div>
      <form
        className={styles.topicForm}
        onSubmit={(event) => {
          event.preventDefault();
          if (topic.trim().length >= 3) void search({ topic: topic.trim() });
        }}
      >
        <label htmlFor="paper-topic">Research interest</label>
        <div>
          <input
            id="paper-topic"
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            maxLength={240}
            placeholder="e.g. personalized AI tutoring and long-term learning"
          />
          <button className="primary" type="submit" disabled={loading || topic.trim().length < 3}>
            Search papers
          </button>
        </div>
      </form>
      {document && analysis && (
        <button
          className="secondary"
          onClick={() => void search({ document, analysis })}
          disabled={loading}
        >
          Find papers related to current document
        </button>
      )}
      {history.length > 0 && (
        <details className={styles.searches}>
          <summary>Saved searches ({history.length})</summary>
          <ol>
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    controller.current?.abort();
                    setLoading(false);
                    setError(null);
                    setTopic(entry.topic);
                    setResult(entry.result);
                    setTopicResult(true);
                    setSavedAt(entry.createdAt);
                  }}
                >
                  {entry.topic}
                </button>{" "}
                <span>
                  {new Date(entry.createdAt).toLocaleString()} ·{" "}
                  {entry.result.recommendations.length} papers
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {loading && <p role="status">Searching scholarly records…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          {savedAt && <p role="status">Saved results from {new Date(savedAt).toLocaleString()}.</p>}
          <div role="status">
            {result.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
          <div className={styles.groups}>
            {(topicResult ? (["related"] as const) : (["background", "related"] as const)).map(
              (kind) => {
                const papers = result.recommendations.filter((entry) => entry.kind === kind);
                return (
                  <div key={kind}>
                    <h3>
                      {topicResult
                        ? "Search results"
                        : kind === "background"
                          ? "Read first"
                          : "Related"}
                    </h3>
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
                              paper.authors.length
                                ? paper.authors.join(", ")
                                : "Authors unavailable",
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
                          {!!conceptIds.length && analysis && (
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
              },
            )}
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
