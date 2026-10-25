"use client";

/** The analysis results in the extension panel: possible conflicts and related papers, linked. */
import type { ReactNode } from "react";
import { ExternalLink, FileDown } from "lucide-react";
import type { DocumentRecord } from "@/lib/browser-store";
import type { ContradictionReport } from "@/types/contradictions";
import type { PaperRecord } from "@/types/research";

const MAX_CONFLICTS = 4;
const MAX_RELATED = 6;

export function Conflicts({ record }: { record: DocumentRecord }) {
  const report = record.contradictions;
  const step = record.pipeline?.contradictions;
  if (!report || step?.status !== "done") return null;
  const compared = (report.sources?.length ?? report.documentIds.length) - 1;
  return (
    <section className="ext-results" aria-labelledby="ext-conflicts">
      <h3 id="ext-conflicts">Possible conflicts</h3>
      {report.findings.length === 0 ? (
        <p className="ext-empty">
          None found across {compared} other paper{compared === 1 ? "" : "s"}.
        </p>
      ) : (
        <ul className="ext-conflicts">
          {report.findings.slice(0, MAX_CONFLICTS).map((finding) => (
            <li key={finding.id}>
              <div className="ext-conflict-head">
                <strong>{finding.topic}</strong>
                <span
                  className="ext-badge"
                  data-tone={finding.review.grok === "contradiction" ? "strong" : "weak"}
                >
                  {finding.review.grok === "contradiction" ? "Both models agree" : "Needs review"}
                </span>
              </div>
              {finding.claims.map((claim) => (
                <blockquote key={`${finding.id}-${claim.documentId}`}>
                  <p>“{claim.source.quote}”</p>
                  <ClaimSource
                    report={report}
                    record={record}
                    documentId={claim.documentId}
                    pageNumber={claim.source.pageNumber}
                  />
                </blockquote>
              ))}
            </li>
          ))}
        </ul>
      )}
      {report.findings.length > MAX_CONFLICTS && (
        <p className="ext-empty">
          {report.findings.length - MAX_CONFLICTS} more in the vault&apos;s Conflicts tab.
        </p>
      )}
    </section>
  );
}

function ClaimSource({
  report,
  record,
  documentId,
  pageNumber,
}: {
  report: ContradictionReport;
  record: DocumentRecord;
  documentId: string;
  pageNumber: number;
}) {
  if (documentId === record.id) return <cite>This paper, p. {pageNumber}</cite>;
  const source = report.sources?.find((entry) => entry.documentId === documentId);
  if (source?.kind === "literature")
    return (
      <cite>
        {source.url ? <PaperLink href={source.url}>{source.title}</PaperLink> : source.title}
        <span> · abstract</span>
      </cite>
    );
  return (
    <cite>
      {source?.title ?? "A saved paper"}, p. {pageNumber}
    </cite>
  );
}

export function RelatedPapers({ record }: { record: DocumentRecord }) {
  const recommendations = record.recommendations?.recommendations ?? [];
  if (!recommendations.length) return null;
  return (
    <section className="ext-results" aria-labelledby="ext-related">
      <h3 id="ext-related">Related papers</h3>
      <ul className="ext-papers">
        {recommendations.slice(0, MAX_RELATED).map(({ paper, kind }) => (
          <li key={paper.id}>
            <PaperLink href={paper.url}>{paper.title}</PaperLink>
            <small>
              {[byline(paper), kind === "background" ? "Background" : null]
                .filter(Boolean)
                .join(" · ")}
            </small>
            {paper.openAccessPdfUrl && (
              <a
                className="ext-pdf-link"
                href={paper.openAccessPdfUrl}
                target="_blank"
                rel="noreferrer"
              >
                <FileDown size={12} aria-hidden /> Open-access PDF
              </a>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function byline(paper: PaperRecord): string {
  const author = paper.authors[0]
    ? `${paper.authors[0].split(" ").at(-1)}${paper.authors.length > 1 ? " et al." : ""}`
    : null;
  return [author, paper.year, paper.venue].filter(Boolean).join(", ");
}

function PaperLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="ext-paper-link" href={href} target="_blank" rel="noreferrer">
      {children}
      <ExternalLink size={11} aria-hidden />
    </a>
  );
}
