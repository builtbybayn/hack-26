"use client";

import { useEffect, useState } from "react";
import {
  deleteProject,
  getProject,
  listProjects,
  saveProject,
  type ResearchProject,
} from "@/lib/browser-store";
import type { ParsedDocument } from "@/types/ingestion";
import type { DocumentAnalysis } from "@/types/intelligence";
import type { PaperRecord, RecommendationsResult } from "@/types/research";
import { RecommendationsPanel } from "@/features/recommendations/RecommendationsPanel";
import { SynthesisPanel } from "@/features/synthesis/SynthesisPanel";
import type { SynthesisReport } from "@/types/synthesis";
import { BriefPanel } from "@/features/brief/BriefPanel";
import type { ResearchBrief } from "@/types/brief";
import { GapExplorer } from "@/features/gaps/GapExplorer";
import { PaperGraph } from "@/features/paper-graph/PaperGraph";
import { addTopicSearch } from "./search-history";
import styles from "./projects.module.css";

export function ResearchProjects({
  document,
  analysis,
}: {
  document: ParsedDocument | null;
  analysis: DocumentAnalysis | null;
}) {
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const selected = projects.find((project) => project.id === selectedId);

  useEffect(() => {
    listProjects()
      .then((saved) => {
        setProjects(saved);
        setSelectedId((id) => id || saved[0]?.id || "");
        setNotes(saved[0]?.notes ?? "");
        setProjectName(saved[0]?.name ?? "");
      })
      .catch(() => setError("Projects could not be loaded from this browser."));
  }, []);

  async function persist(project: ResearchProject) {
    try {
      await saveProject(project);
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      setError("");
      return true;
    } catch {
      setError("This change could not be saved in this browser.");
      return false;
    }
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    const project: ResearchProject = {
      id: crypto.randomUUID(),
      name: trimmed,
      notes: "",
      papers: [],
      searchHistory: [],
      documentIds: [],
      updatedAt: new Date().toISOString(),
    };
    if (!(await persist(project))) return;
    setSelectedId(project.id);
    setNotes("");
    setProjectName(project.name);
    setName("");
  }

  async function remove() {
    if (
      !selected ||
      !window.confirm(
        `Delete project “${selected.name}” and all its notes, saved papers, synthesis, brief, and gap ideas?`,
      )
    )
      return;
    try {
      await deleteProject(selected.id);
      const remaining = projects.filter((project) => project.id !== selected.id);
      setProjects(remaining);
      setSelectedId(remaining[0]?.id ?? "");
      setNotes(remaining[0]?.notes ?? "");
      setProjectName(remaining[0]?.name ?? "");
      setError("");
    } catch {
      setError("The project could not be deleted.");
    }
  }

  async function savePaper(paper: PaperRecord) {
    if (!selected) return;
    try {
      const latest = await getProject(selected.id);
      if (!latest) return;
      if (
        latest.papers.some((item) => item.id === paper.id || (item.doi && item.doi === paper.doi))
      )
        return;
      await persist({
        ...latest,
        papers: [...latest.papers, paper],
        updatedAt: new Date().toISOString(),
      });
    } catch {
      setError("This paper could not be saved in this browser.");
    }
  }

  async function saveSearch(projectId: string, topic: string, result: RecommendationsResult) {
    try {
      const latest = await getProject(projectId);
      if (!latest) {
        setError("The selected project no longer exists.");
        return false;
      }
      return persist(
        addTopicSearch(latest, {
          id: crypto.randomUUID(),
          topic,
          createdAt: new Date().toISOString(),
          result,
        }),
      );
    } catch {
      setError("This search could not be saved in this browser.");
      return false;
    }
  }

  return (
    <>
      <section className={styles.panel} aria-labelledby="projects-heading">
        <span className="step">RESEARCH PROJECTS</span>
        <h2 id="projects-heading">Your library</h2>
        <p>Saved in this browser. Group papers and keep notes as you read.</p>
        <div className={styles.controls}>
          <label>
            Project
            <select
              value={selectedId}
              onChange={(event) => {
                setSelectedId(event.target.value);
                setNotes(
                  projects.find((project) => project.id === event.target.value)?.notes ?? "",
                );
                setProjectName(
                  projects.find((project) => project.id === event.target.value)?.name ?? "",
                );
              }}
            >
              <option value="">Select a project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <label>
              New project
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                placeholder="Project name"
              />
            </label>
            <button className="secondary" type="submit" disabled={!name.trim()}>
              Create
            </button>
          </form>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {selected && (
          <div className={styles.detail}>
            <div className={styles.title}>
              <h3>{selected.name}</h3>
              <button className="secondary" onClick={remove}>
                Delete project
              </button>
            </div>
            <div className={styles.controls}>
              <label>
                Rename project
                <input
                  value={projectName}
                  maxLength={100}
                  onChange={(event) => setProjectName(event.target.value)}
                />
              </label>
              <button
                className="secondary"
                disabled={!projectName.trim() || projectName.trim() === selected.name}
                onClick={() =>
                  void persist({
                    ...selected,
                    name: projectName.trim(),
                    updatedAt: new Date().toISOString(),
                  })
                }
              >
                Save name
              </button>
            </div>
            {document && (
              <button
                className="secondary"
                disabled={selected.documentIds.includes(document.id)}
                onClick={() =>
                  void persist({
                    ...selected,
                    documentIds: [...selected.documentIds, document.id],
                    updatedAt: new Date().toISOString(),
                  })
                }
              >
                {selected.documentIds.includes(document.id)
                  ? "Document added"
                  : "Add current document"}
              </button>
            )}
            <p>
              {selected.documentIds.length} analyzed document
              {selected.documentIds.length === 1 ? "" : "s"} · {selected.papers.length} saved paper
              {selected.papers.length === 1 ? "" : "s"}
            </p>
            {selected.papers.length > 0 && (
              <ul className={styles.papers}>
                {selected.papers.map((paper) => (
                  <li key={paper.id}>
                    <a href={paper.url} target="_blank" rel="noopener noreferrer">
                      {paper.title}
                    </a>
                    <button
                      onClick={() =>
                        void persist({
                          ...selected,
                          papers: selected.papers.filter((item) => item.id !== paper.id),
                          updatedAt: new Date().toISOString(),
                        })
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <label className={styles.notes}>
              Project notes
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} />
            </label>
            <button
              className="secondary"
              disabled={notes === selected.notes}
              onClick={() =>
                void persist({ ...selected, notes, updatedAt: new Date().toISOString() })
              }
            >
              Save notes
            </button>
          </div>
        )}
      </section>
      <RecommendationsPanel
        key={selected?.id ?? "no-project"}
        document={document ?? undefined}
        analysis={analysis ?? undefined}
        onSavePaper={selected ? savePaper : undefined}
        onSaveSearch={
          selected ? (topic, result) => saveSearch(selected.id, topic, result) : undefined
        }
        history={selected?.searchHistory ?? []}
        savedPaperIds={selected?.papers.map((paper) => paper.id) ?? []}
      />
      {selected && (
        <SynthesisPanel
          key={selected.id}
          project={selected}
          onSave={async (synthesis: SynthesisReport) => {
            const latest = await getProject(selected.id);
            return latest
              ? persist({ ...latest, synthesis, updatedAt: new Date().toISOString() })
              : false;
          }}
        />
      )}
      {selected && (
        <BriefPanel
          key={selected.id}
          project={selected}
          onSave={async (brief: ResearchBrief) => {
            const latest = await getProject(selected.id);
            return latest
              ? persist({ ...latest, brief, updatedAt: new Date().toISOString() })
              : false;
          }}
        />
      )}
      {selected && (
        <GapExplorer
          project={selected}
          onUpdate={async (change) => {
            const latest = await getProject(selected.id);
            return latest
              ? persist({ ...change(latest), updatedAt: new Date().toISOString() })
              : false;
          }}
        />
      )}
      {selected && (
        <PaperGraph
          key={selected.id}
          project={selected}
          onSaveReferences={async (references) => {
            const latest = await getProject(selected.id);
            return latest
              ? persist({
                  ...latest,
                  papers: latest.papers.map((paper) =>
                    Object.hasOwn(references, paper.id)
                      ? { ...paper, referencedWorkIds: references[paper.id] }
                      : paper,
                  ),
                  updatedAt: new Date().toISOString(),
                })
              : false;
          }}
        />
      )}
    </>
  );
}
