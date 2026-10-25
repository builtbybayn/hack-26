"use client";

import { useEffect, useRef, useState } from "react";
import {
  listDocumentRecords,
  type DocumentRecord,
  type ResearchProject,
} from "@/lib/browser-store";
import type { ResearchBrief } from "@/types/brief";
import { checkBriefFinding } from "@/lib/api/brief-check-client";
import { createResearchBrief, editBriefFinding } from "./create-brief";
import { BriefView } from "./BriefView";
import styles from "./brief.module.css";

export function BriefPanel({
  project,
  onSave,
}: {
  project: ResearchProject;
  onSave: (brief: ResearchBrief) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<ResearchBrief | null>(project.brief ?? null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<number | null>(null);
  const [error, setError] = useState("");
  const editVersion = useRef(0);
  const stale =
    !!draft &&
    !!project.synthesis &&
    draft.sourceSynthesisCreatedAt !== project.synthesis.createdAt;

  useEffect(() => {
    listDocumentRecords()
      .then(setDocuments)
      .catch(() => setError("Stored source documents could not be loaded."));
  }, [project.documentIds, project.synthesis?.createdAt]);

  async function save(brief: ResearchBrief) {
    const updated = { ...brief, updatedAt: new Date().toISOString() };
    const version = editVersion.current;
    setDraft(updated);
    setDirty(true);
    setSaving(true);
    try {
      if (!(await onSave(updated))) throw new Error("Save failed");
      if (version === editVersion.current) setDirty(false);
      setError("");
    } catch {
      setDirty(true);
      setError("The brief could not be saved in this browser.");
    } finally {
      setSaving(false);
    }
  }

  function update(change: Partial<ResearchBrief>) {
    if (!draft) return;
    editVersion.current += 1;
    setDraft({ ...draft, ...change });
    setDirty(true);
  }

  function generate() {
    if (!project.synthesis?.findings.length) return;
    if (draft && !window.confirm("Replace this brief and its edits with the latest synthesis?"))
      return;
    void save(createResearchBrief(project.name, project.synthesis, project.papers));
  }

  async function recheck(index: number) {
    if (!draft || checking !== null || saving) return;
    const finding = draft.findings[index];
    const sourceIds = [...new Set(finding.evidence.map((item) => item.documentId))];
    const sources = sourceIds.map((id) => documents.find((record) => record.id === id)?.document);
    if (sources.some((source) => !source)) {
      setError("A cited source document is missing from this browser.");
      return;
    }
    const version = editVersion.current;
    setChecking(index);
    setError("");
    try {
      const result = await checkBriefFinding({
        documents: sources.filter((source) => source !== undefined),
        finding,
      });
      if (version !== editVersion.current) {
        setError("The summary changed while it was being checked. Check it again.");
        return;
      }
      if (!result.ok) throw new Error(result.error.message);
      await save({
        ...draft,
        findings: draft.findings.map((item, itemIndex) =>
          itemIndex === index
            ? {
                ...item,
                assessment: result.data.finding.assessment,
                evidence: result.data.finding.evidence,
                checkedSummary: item.summary,
              }
            : item,
        ),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The brief check failed.");
    } finally {
      setChecking(null);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="brief-heading">
      <span className="step">RESEARCH BRIEF</span>
      <h2 id="brief-heading">Make a brief</h2>
      <p>Build a printable brief from the project synthesis and its source passages.</p>
      {!project.synthesis?.findings.length && (
        <p>Generate a synthesis with verified findings first.</p>
      )}
      {project.synthesis?.findings.length ? (
        <button className="secondary" disabled={saving || checking !== null} onClick={generate}>
          {draft ? "Replace from latest synthesis" : "Create brief"}
        </button>
      ) : null}
      {stale && (
        <p className={styles.note}>
          The synthesis has changed since this brief was created. Your current brief remains saved
          until you replace it.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <>
          <div className={styles.editor}>
            <label>
              Title
              <input
                value={draft.title}
                maxLength={160}
                onChange={(event) => update({ title: event.target.value })}
              />
            </label>
            <label>
              Research question
              <input
                value={draft.researchQuestion}
                maxLength={500}
                onChange={(event) => update({ researchQuestion: event.target.value })}
              />
            </label>
            <label>
              Researcher notes
              <textarea
                value={draft.researcherNotes}
                rows={4}
                onChange={(event) => update({ researcherNotes: event.target.value })}
              />
            </label>
            <h3>Findings</h3>
            {draft.findings.map((finding, index) => (
              <div key={`${finding.theme}-${index}`} className={styles.editFinding}>
                <label className={styles.check}>
                  <input
                    type="checkbox"
                    checked={finding.included}
                    onChange={(event) =>
                      update({
                        findings: draft.findings.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, included: event.target.checked } : item,
                        ),
                      })
                    }
                  />{" "}
                  Include {finding.theme}
                </label>
                <label>
                  Summary
                  <textarea
                    value={finding.summary}
                    rows={3}
                    maxLength={1500}
                    onChange={(event) =>
                      update({
                        findings: draft.findings.map((item, itemIndex) =>
                          itemIndex === index ? editBriefFinding(item, event.target.value) : item,
                        ),
                      })
                    }
                  />
                </label>
                {finding.edited && (
                  <div className={styles.checkAction}>
                    <button
                      type="button"
                      disabled={checking !== null || saving || !finding.summary.trim()}
                      onClick={() => void recheck(index)}
                    >
                      {checking === index ? "Checking sources…" : "Check revised claim"}
                    </button>
                    {finding.checkedSummary === finding.summary && finding.assessment && (
                      <span>
                        AI check: {finding.assessment.verdict}. {finding.assessment.reason}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div className={styles.actions}>
              <button
                className="primary"
                disabled={
                  saving ||
                  checking !== null ||
                  !dirty ||
                  !draft.title.trim() ||
                  !draft.researchQuestion.trim() ||
                  draft.findings.some((item) => item.included && !item.summary.trim())
                }
                onClick={() => void save(draft)}
              >
                Save brief
              </button>
              {dirty ? (
                <span>Save your changes to open the print view.</span>
              ) : (
                <a
                  href={`/brief?project=${encodeURIComponent(project.id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open print view
                </a>
              )}
            </div>
          </div>
          <BriefView brief={draft} documents={documents} />
        </>
      )}
    </section>
  );
}
