import type { ResearchBrief } from "@/types/brief";
import type { DocumentRecord } from "@/lib/browser-store";
import styles from "./brief.module.css";

const groups = [
  ["agreement", "Key findings"],
  ["difference", "Points of disagreement"],
  ["open_question", "Open questions"],
] as const;

export function BriefView({
  brief,
  documents,
}: {
  brief: ResearchBrief;
  documents: DocumentRecord[];
}) {
  return (
    <article className={styles.brief}>
      <span className="step">RESEARCH BRIEF</span>
      <h1>{brief.title}</h1>
      <p className={styles.meta}>Updated {new Date(brief.updatedAt).toLocaleDateString()}</p>
      <h2>Research question</h2>
      <p>{brief.researchQuestion}</p>
      {groups.map(([kind, heading]) => {
        const findings = brief.findings.filter((item) => item.included && item.kind === kind);
        if (!findings.length) return null;
        return (
          <section key={kind}>
            <h2>{heading}</h2>
            {findings.map((finding, index) => (
              <div key={`${finding.theme}-${index}`} className={styles.finding}>
                <h3>{finding.theme}</h3>
                <p>{finding.summary}</p>
                {finding.assessment &&
                  (!finding.edited || finding.checkedSummary === finding.summary) && (
                    <p className={styles.note}>
                      AI {finding.edited ? "brief" : "synthesis"} check:{" "}
                      {finding.assessment.verdict}. {finding.assessment.reason}
                    </p>
                  )}
                {finding.edited && finding.checkedSummary !== finding.summary && (
                  <p className={styles.note}>
                    Edited by researcher; check the interpretation against these source passages.
                  </p>
                )}
                <ul>
                  {finding.evidence.map((item, evidenceIndex) => {
                    const document = documents.find(
                      (record) => record.id === item.documentId,
                    )?.document;
                    const page = document?.pages.find(
                      (entry) => entry.pageNumber === item.pageNumber,
                    );
                    return (
                      <li key={`${item.documentId}-${item.pageNumber}-${evidenceIndex}`}>
                        {item.assessment &&
                          (!finding.edited || finding.checkedSummary === finding.summary) && (
                            <p className={styles.note}>
                              AI source check: {item.assessment.verdict}. {item.assessment.reason}
                            </p>
                          )}
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
              </div>
            ))}
          </section>
        );
      })}
      {brief.researcherNotes && (
        <section>
          <h2>Researcher notes</h2>
          <p className={styles.note}>Personal notes; not source verified.</p>
          <p className={styles.notes}>{brief.researcherNotes}</p>
        </section>
      )}
      {!!brief.readingList?.length && (
        <section>
          <h2>Saved reading list</h2>
          <p className={styles.note}>
            Bibliographic records saved to the project; these papers were not necessarily analyzed
            for this brief.
          </p>
          <ul>
            {brief.readingList.map((paper) => (
              <li key={paper.id}>
                <a href={paper.url}>{paper.title}</a>
                {paper.year ? ` (${paper.year})` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <h2>Source documents</h2>
        <ol>
          {brief.documentIds.map((id) => {
            const document = documents.find((record) => record.id === id)?.document;
            return (
              <li key={id}>{document?.title ?? document?.source.fileName ?? `Document ${id}`}</li>
            );
          })}
        </ol>
      </section>
    </article>
  );
}
