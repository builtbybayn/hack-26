"use client";

/**
 * "Start a research project" in the extension panel: describe an idea, get a roadmap of concepts
 * and real papers in order, filed in the vault as a new project (Notes/Roadmap, Papers). Then keep
 * shaping it by conversation; every revision rewrites the roadmap note.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowUp, ExternalLink, FolderPlus } from "lucide-react";
import { loadLocal, saveLocal } from "@/features/vault/use-settings";
import { newProjectEntries, uniqueName } from "@/features/vault/vault-tree";
import { requestRoadmap } from "@/lib/api/roadmap-client";
import { listVaultEntries, putVaultEntries } from "@/lib/browser-store";
import { roadmapToMarkdown } from "@/lib/research/roadmap-markdown";
import type { Roadmap, RoadmapTurn } from "@/types/roadmap";
import type { VaultNote } from "@/types/vault";

interface Project {
  idea: string;
  roadmap: Roadmap;
  projectId: string;
  noteId: string;
  conversation: RoadmapTurn[];
}

/** The project being shaped, so closing the panel doesn't lose the conversation. */
const STORAGE_KEY = "panelProject";

export function ProjectBuilder({
  onOpenEntry,
  onActiveChange,
}: {
  onOpenEntry: (entryId: string, projectId?: string) => void;
  /** Whether a project is being shaped, so the panel can give it more room. */
  onActiveChange?: (active: boolean) => void;
}) {
  const [project, setProject] = useState<Project | null>(null);
  const [draft, setDraft] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Restore after hydration (the server render has no localStorage).
  useEffect(() => {
    void Promise.resolve().then(() => setProject(loadLocal<Project | null>(STORAGE_KEY, null)));
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [project?.conversation.length, working]);

  const remember = (next: Project | null) => {
    setProject(next);
    saveLocal(STORAGE_KEY, next);
  };

  const active = project !== null;
  useEffect(() => {
    onActiveChange?.(active);
  }, [active, onActiveChange]);

  async function create(idea: string) {
    setWorking(true);
    setError(null);
    const result = await requestRoadmap({ idea });
    if (!result.ok) {
      setWorking(false);
      setError(result.error.message);
      return;
    }
    const { roadmap, reply, warnings } = result.data;
    try {
      const entries = await listVaultEntries();
      const {
        project: folder,
        roadmap: note,
        created,
      } = newProjectEntries(entries, roadmap.projectName, roadmapToMarkdown(roadmap));
      await putVaultEntries(created);
      remember({
        idea,
        roadmap: { ...roadmap, projectName: folder.name },
        projectId: folder.id,
        noteId: note.id,
        conversation: [{ role: "assistant", content: withWarnings(reply, warnings) }],
      });
      setDraft("");
    } catch {
      setError("Couldn't save the project to your vault.");
    } finally {
      setWorking(false);
    }
  }

  async function revise(current: Project, feedback: string) {
    const conversation: RoadmapTurn[] = [
      ...current.conversation,
      { role: "user", content: feedback },
    ];
    remember({ ...current, conversation });
    setDraft("");
    setWorking(true);
    setError(null);
    const result = await requestRoadmap({
      idea: current.idea,
      previous: current.roadmap,
      conversation,
    });
    if (!result.ok) {
      setWorking(false);
      setError(result.error.message);
      return;
    }
    const { roadmap, reply, warnings } = result.data;
    try {
      const allEntries = await listVaultEntries(true);
      if (
        allEntries.some(
          (entry) =>
            entry.trashedAt && (entry.id === current.projectId || entry.id === current.noteId),
        )
      ) {
        setError("Restore this project and roadmap from Trash before revising it.");
        return;
      }
      const entries = allEntries.filter((entry) => !entry.trashedAt);
      const note = entries.find(
        (entry): entry is VaultNote => entry.id === current.noteId && entry.kind === "note",
      );
      let { projectId, noteId } = current;
      let projectName = roadmap.projectName;
      if (note) {
        const folder = entries.find((entry) => entry.id === projectId && entry.kind === "folder");
        const at = new Date().toISOString();
        if (folder) projectName = uniqueName(entries, null, roadmap.projectName, folder.id);
        await putVaultEntries([
          { ...note, body: roadmapToMarkdown(roadmap), updatedAt: at },
          ...(folder ? [{ ...folder, name: projectName, updatedAt: at }] : []),
        ]);
      } else {
        // The note (or project) was deleted in the vault: file the revision as a new project.
        const fresh = newProjectEntries(entries, roadmap.projectName, roadmapToMarkdown(roadmap));
        await putVaultEntries(fresh.created);
        projectId = fresh.project.id;
        projectName = fresh.project.name;
        noteId = fresh.roadmap.id;
      }
      remember({
        ...current,
        roadmap: { ...roadmap, projectName },
        projectId,
        noteId,
        conversation: [
          ...conversation,
          { role: "assistant", content: withWarnings(reply, warnings) },
        ],
      });
    } catch {
      setError("Couldn't update the roadmap note in your vault.");
    } finally {
      setWorking(false);
    }
  }

  const submit = () => {
    const text = draft.trim();
    if (!text || working) return;
    if (project) void revise(project, text);
    else void create(text);
  };

  return (
    <div className="ext-project">
      {!project ? (
        <form
          className="ext-project-start"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor="ext-idea">What do you want to research?</label>
          <textarea
            id="ext-idea"
            rows={4}
            value={draft}
            placeholder="e.g. How quantum algorithms could make reinforcement learning more sample-efficient"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) submit();
            }}
          />
          <button type="submit" className="mod-cta ext-wide" disabled={!draft.trim() || working}>
            <FolderPlus size={15} aria-hidden />
            {working ? "Planning your roadmap…" : "Create project and roadmap"}
          </button>
          <p className="ext-hint">
            Your description becomes a named research project with a Roadmap note: the concepts and
            papers to work through, from foundations to the research frontier.
          </p>
        </form>
      ) : (
        <>
          <section className="ext-roadmap" aria-label="Roadmap">
            <div className="ext-roadmap-head">
              <div>
                <h2>{project.roadmap.projectName}</h2>
                <p>{project.roadmap.goal}</p>
              </div>
            </div>
            <ol className="ext-roadmap-stages">
              {project.roadmap.stages.map((stage) => (
                <li key={stage.title}>
                  <strong>{stage.title}</strong>
                  <small>
                    {stage.concepts.length} concept{stage.concepts.length === 1 ? "" : "s"} ·{" "}
                    {stage.papers.length} paper{stage.papers.length === 1 ? "" : "s"}
                  </small>
                </li>
              ))}
            </ol>
            <div className="ext-roadmap-actions">
              <button
                type="button"
                className="mod-cta"
                onClick={() => onOpenEntry(project.noteId, project.projectId)}
              >
                <ExternalLink size={14} aria-hidden /> Open roadmap in workspace
              </button>
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  remember(null);
                  setError(null);
                }}
                disabled={working}
              >
                New project
              </button>
            </div>
          </section>

          <div className="ext-roadmap-chat" aria-live="polite">
            {project.conversation.map((turn, index) => (
              <article key={index} className={`chat-message is-${turn.role}`}>
                <p className="chat-text">{turn.content}</p>
              </article>
            ))}
            {working && (
              <article className="chat-message is-assistant is-waiting">
                <span className="typing" aria-label="Reshaping the roadmap">
                  <span />
                  <span />
                  <span />
                </span>
              </article>
            )}
            <div ref={endRef} />
          </div>

          <form
            className="chat-composer"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className="composer-box">
              <textarea
                rows={1}
                aria-label="Shape the roadmap"
                placeholder="Shape it: skip the basics, add a stage on…"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <button
                type="submit"
                className="composer-send"
                aria-label="Send"
                disabled={!draft.trim() || working}
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </form>
        </>
      )}
      {error && (
        <p className="ext-status is-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function withWarnings(reply: string, warnings: string[]): string {
  return warnings.length ? `${reply}\n\n${warnings.join(" ")}` : reply;
}
