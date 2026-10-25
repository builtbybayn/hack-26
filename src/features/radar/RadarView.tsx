"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Radar, Search, X } from "lucide-react";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";
import { requestRadarDeepDive, requestRadarScan } from "@/lib/api/radar-client";
import { activeScan } from "@/lib/radar/recency";
import type { ResearchContext, ResearchFinding, ResearchPaper, ResearchScan } from "@/types/radar";
import { buildRadarContext } from "./context";
import { loadRadarScan, saveRadarScan } from "./storage";
import "./radar.css";

const label = (value: string) => value.replaceAll("_", " ");
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";

function PaperLink({ paper }: { paper: ResearchPaper }) {
  return (
    <div className="radar-paper">
      <a className="radar-link" href={paper.url} target="_blank" rel="noopener noreferrer">
        {paper.title} {paper.year ? `(${paper.year})` : ""} <ExternalLink size={13} />
      </a>
      <p className="radar-muted">{paper.venue || "Venue not listed"} · Abstract-level evidence</p>
      {paper.abstract && <p>{paper.abstract}</p>}
    </div>
  );
}

export function RadarView() {
  const { data } = useWorkspace();
  const context = useMemo(() => buildRadarContext(data), [data]);
  return <RadarContent key={context?.projectId ?? "none"} context={context} />;
}

function RadarContent({ context }: { context: ResearchContext | null }) {
  const [summary, setSummary] = useState(context?.projectSummary ?? "");
  const [consent, setConsent] = useState(false);
  const [scan, setScan] = useState<ResearchScan | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState<"scan" | "deep-dive" | "">("");
  const [controller, setController] = useState<AbortController | null>(null);
  const [error, setError] = useState("");
  const [platform, setPlatform] = useState("all");
  const [evidence, setEvidence] = useState("all");
  const [feasibility, setFeasibility] = useState("all");
  const [impact, setImpact] = useState("all");
  const [minRelevance, setMinRelevance] = useState(0);
  const [sort, setSort] = useState("relevance");
  const [newestAfter, setNewestAfter] = useState(7);
  const projectId = context?.projectId;

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void loadRadarScan(projectId).then((stored) => {
      if (!cancelled) setScan(stored);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Recheck the rolling window while this tab is open and on every render of saved results.
  const current = scan ? activeScan(scan) : null;
  const findings = (current?.findings ?? [])
    .filter(
      (finding) =>
        platform === "all" || finding.socialSources.some((source) => source.platform === platform),
    )
    .filter(
      (finding) => evidence === "all" || finding.claims.some((claim) => claim.status === evidence),
    )
    .filter((finding) => feasibility === "all" || finding.feasibility === feasibility)
    .filter((finding) => impact === "all" || finding.projectImpact === impact)
    .filter((finding) => finding.relevanceScore >= minRelevance)
    .filter((finding) =>
      finding.socialSources.some(
        (source) => Date.parse(source.publishedAt) >= Date.now() - newestAfter * 86_400_000,
      ),
    )
    .sort((a, b) =>
      sort === "newest"
        ? Date.parse(b.socialSources[0].publishedAt) - Date.parse(a.socialSources[0].publishedAt)
        : b.relevanceScore - a.relevanceScore,
    );
  const selected = current?.findings.find((finding) => finding.id === selectedId);

  async function runScan() {
    if (!context || !consent || !summary.trim()) return;
    const abort = new AbortController();
    setController(abort);
    setBusy("scan");
    setError("");
    try {
      const response = await requestRadarScan(
        { ...context, projectSummary: summary.trim() },
        abort.signal,
      );
      if (!response.ok) throw new Error(response.error.message);
      setScan(response.data);
      setSelectedId("");
      await saveRadarScan(response.data);
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : "The scan failed.");
    } finally {
      setBusy("");
      setController(null);
    }
  }

  async function runDeepDive(finding: ResearchFinding) {
    if (!context || !consent || !current) return;
    const abort = new AbortController();
    setController(abort);
    setBusy("deep-dive");
    setError("");
    try {
      const response = await requestRadarDeepDive(
        { ...context, projectSummary: summary.trim() },
        finding,
        abort.signal,
      );
      if (!response.ok) throw new Error(response.error.message);
      const updated = {
        ...current,
        deepDives: { ...current.deepDives, [finding.id]: response.data },
      };
      setScan(updated);
      await saveRadarScan(updated);
    } catch (cause) {
      if (!abort.signal.aborted)
        setError(cause instanceof Error ? cause.message : "Deep Dive failed.");
    } finally {
      setBusy("");
      setController(null);
    }
  }

  return (
    <div className="radar-view">
      <header className="page-heading">
        <div>
          <h1>News</h1>
          <p className="mt-2 text-sm text-muted">Research signals for your project.</p>
        </div>
      </header>
      {!context ? (
        <div className="surface radar-block">Open a project to scan for research updates.</div>
      ) : (
        <>
          <section className="surface radar-block" aria-label="Research context">
            <div className="radar-head">
              <div>
                <p className="eyebrow">ACTIVE PROJECT</p>
                <h2>{context.projectTitle}</h2>
              </div>
              <Radar size={22} aria-hidden="true" />
            </div>
            <label className="radar-label" htmlFor="radar-summary">
              Project context
            </label>
            <textarea
              id="radar-summary"
              className="radar-textarea"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={2000}
              rows={3}
            />
            <p className="radar-muted">
              Goals, concepts, and questions also inform search. Notes and document pages stay in
              your browser.
            </p>
            <label className="radar-consent">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />{" "}
              I agree to share this summary with xAI, claim text with OpenAlex, and assessments with
              the configured AI provider.
            </label>
            <div className="radar-actions">
              <button
                className="btn"
                onClick={() => void runScan()}
                disabled={!consent || !summary.trim() || !!busy}
              >
                <Search size={15} /> Scan for Research Updates
              </button>
              {busy && (
                <button className="btn" onClick={() => controller?.abort()}>
                  <X size={15} /> Cancel
                </button>
              )}
            </div>
            {busy && (
              <p role="status" className="radar-muted">
                {busy === "scan"
                  ? "Searching recent discussions and checking evidence…"
                  : "Finding additional research for this claim…"}
              </p>
            )}
            {error && (
              <p role="alert" className="radar-error">
                {error}
              </p>
            )}
          </section>
          <section className="surface radar-block radar-overview" aria-label="Research overview">
            <div className="radar-head">
              <h2>This week</h2>
              <span>{current ? `Scanned ${date(current.scannedAt)}` : "Not scanned yet"}</span>
            </div>
            <div className="radar-stats">
              <div>
                <strong>{current?.findings.length ?? 0}</strong>
                <span>Findings</span>
              </div>
              <div>
                <strong>
                  {current?.findings.filter((finding) =>
                    finding.claims.some((claim) =>
                      ["mixed", "insufficient_evidence"].includes(claim.status),
                    ),
                  ).length ?? 0}
                </strong>
                <span>Need review</span>
              </div>
              <div>
                <strong>
                  {current?.findings.filter(
                    (finding) =>
                      finding.projectImpact === "improvement_opportunity" ||
                      finding.projectImpact === "potential_risk",
                  ).length ?? 0}
                </strong>
                <span>Opportunities / risks</span>
              </div>
            </div>
            <p className="radar-muted">
              Sources: {current?.sourcesSearched.join(", ") || "None"}. Reddit is not included.
            </p>
            {current?.warnings.map((warning) => (
              <p className="radar-muted" key={warning}>
                {warning}
              </p>
            ))}
          </section>
          {current && (
            <>
              <details className="radar-filter-panel">
                <summary>
                  Filters <span>{findings.length} results</span>
                </summary>
                <section className="radar-filters" aria-label="Filter findings">
                  <select
                    aria-label="Platform"
                    value={platform}
                    onChange={(event) => setPlatform(event.target.value)}
                  >
                    <option value="all">All platforms</option>
                    <option value="x">X</option>
                    <option value="reddit">Reddit</option>
                  </select>
                  <select
                    aria-label="Evidence"
                    value={evidence}
                    onChange={(event) => setEvidence(event.target.value)}
                  >
                    <option value="all">All evidence</option>
                    {[
                      "supported",
                      "partially_supported",
                      "mixed",
                      "contradicted",
                      "insufficient_evidence",
                      "not_empirically_testable",
                    ].map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Feasibility"
                    value={feasibility}
                    onChange={(event) => setFeasibility(event.target.value)}
                  >
                    <option value="all">All feasibility</option>
                    {["high", "moderate", "low", "unknown"].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Project impact"
                    value={impact}
                    onChange={(event) => setImpact(event.target.value)}
                  >
                    <option value="all">All impacts</option>
                    {[
                      "improvement_opportunity",
                      "potential_risk",
                      "alternative_approach",
                      "existing_related_work",
                      "further_investigation",
                      "no_significant_impact",
                    ].map((value) => (
                      <option key={value} value={value}>
                        {label(value)}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Minimum relevance"
                    value={minRelevance}
                    onChange={(event) => setMinRelevance(Number(event.target.value))}
                  >
                    <option value="0">Any relevance</option>
                    <option value="40">40%+</option>
                    <option value="70">70%+</option>
                  </select>
                  <select
                    aria-label="Published within"
                    value={newestAfter}
                    onChange={(event) => setNewestAfter(Number(event.target.value))}
                  >
                    <option value="7">Past 7 days</option>
                    <option value="3">Past 3 days</option>
                    <option value="1">Past 24 hours</option>
                  </select>
                  <select
                    aria-label="Sort"
                    value={sort}
                    onChange={(event) => setSort(event.target.value)}
                  >
                    <option value="relevance">Most relevant</option>
                    <option value="newest">Newest first</option>
                  </select>
                </section>
              </details>
              {findings.length ? (
                <div className="radar-grid">
                  {findings.map((finding) => (
                    <article className="surface radar-block radar-finding" key={finding.id}>
                      <div className="radar-head">
                        <span className="eyebrow">
                          {finding.socialSources
                            .map((source) => source.platform.toUpperCase())
                            .join(" · ")}
                        </span>
                        <span>{finding.relevanceScore}% relevance</span>
                      </div>
                      <h2>{finding.title}</h2>
                      <p className="radar-muted">
                        Published {date(finding.socialSources[0].publishedAt)}
                      </p>
                      <p>{finding.summary}</p>
                      <div className="radar-tags">
                        <span>Evidence: {label(finding.claims[0].status)}</span>
                        <span>Feasibility: {finding.feasibility}</span>
                        <span>Impact: {label(finding.projectImpact)}</span>
                        <span>Recommendation: {label(finding.recommendation)}</span>
                      </div>
                      <div className="radar-actions">
                        <a
                          className="btn"
                          href={finding.socialSources[0].url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Original <ExternalLink size={14} />
                        </a>
                        <button className="btn" onClick={() => setSelectedId(finding.id)}>
                          Sources
                        </button>
                        <button
                          className="btn"
                          onClick={() => {
                            setSelectedId(finding.id);
                            void runDeepDive(finding);
                          }}
                          disabled={!consent || !!busy}
                        >
                          Deep Dive
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                current.findings.length > 0 && (
                  <p className="radar-muted">No findings match these filters.</p>
                )
              )}
              {selected && (
                <section className="surface radar-block" aria-label="Finding detail">
                  <div className="radar-head">
                    <h2>{selected.title}</h2>
                    <button
                      className="btn"
                      onClick={() => setSelectedId("")}
                      aria-label="Close finding"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="radar-muted">
                    Original post:{" "}
                    <a
                      className="radar-link"
                      href={selected.socialSources[0].url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {date(selected.socialSources[0].publishedAt)} <ExternalLink size={13} />
                    </a>
                  </p>
                  {selected.claims.map((claim, index) => (
                    <div className="radar-claim" key={`${claim.text}-${index}`}>
                      <h3>
                        Claim {index + 1}: {claim.text}
                      </h3>
                      <p>
                        <strong>Evidence: {label(claim.status)}.</strong> {claim.rationale}
                      </p>
                      <p>Conditions: {claim.conditions || "Not specified"}</p>
                      <p>Limitations: {claim.limitations.join(" ") || "Not established"}</p>
                      <p>Unknown: {claim.uncertainties.join(" ") || "Not specified"}</p>
                      <h4>Supporting research</h4>
                      {selected.papers
                        .filter((paper) => claim.supportingPaperIds.includes(paper.id))
                        .map((paper) => (
                          <PaperLink paper={paper} key={paper.id} />
                        ))}
                      <h4>Contradictory research</h4>
                      {selected.papers
                        .filter((paper) => claim.contradictingPaperIds.includes(paper.id))
                        .map((paper) => (
                          <PaperLink paper={paper} key={paper.id} />
                        ))}
                    </div>
                  ))}
                  <h3>Technical feasibility</h3>
                  <p>{selected.feasibilityExplanation}</p>
                  <h3>Project impact</h3>
                  <p>{selected.projectImpactExplanation}</p>
                  <h3>Recommended next steps</h3>
                  <ol>
                    {selected.recommendedSteps.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {current.deepDives?.[selected.id] && (
                    <div className="radar-report">
                      <h3>Deep Dive · {date(current.deepDives[selected.id].createdAt)}</h3>
                      <p>
                        <strong>Research question:</strong>{" "}
                        {current.deepDives[selected.id].researchQuestion}
                      </p>
                      <p>
                        <strong>Supporting evidence:</strong>{" "}
                        {current.deepDives[selected.id].supportingEvidence}
                      </p>
                      <p>
                        <strong>Contradictory evidence:</strong>{" "}
                        {current.deepDives[selected.id].contradictoryEvidence}
                      </p>
                      <p>
                        <strong>Feasibility:</strong> {current.deepDives[selected.id].feasibility}
                      </p>
                      <p>
                        <strong>Integration strategy:</strong>{" "}
                        {current.deepDives[selected.id].integrationStrategy}
                      </p>
                      <p>
                        <strong>Suggested experiment:</strong>{" "}
                        {current.deepDives[selected.id].suggestedExperiment}
                      </p>
                      <p>
                        <strong>Conclusion:</strong> {current.deepDives[selected.id].conclusion}
                      </p>
                      <h4>Additional literature</h4>
                      {current.deepDives[selected.id].papers.map((paper) => (
                        <PaperLink paper={paper} key={paper.id} />
                      ))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
