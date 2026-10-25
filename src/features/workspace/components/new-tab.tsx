"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";

export function NewTab({
  onNewProject,
  onBrowse,
}: {
  onNewProject: () => void;
  onBrowse: () => void;
}) {
  const { service, setAssistantOpen } = useWorkspace();
  const router = useRouter();
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);
  const [createdProjectId, setCreatedProjectId] = useState("");
  const submitting = useRef(false);
  async function submit() {
    const text = prompt.trim();
    if (!text || submitting.current || created) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    let projectCreated = false;
    try {
      const project = await service.createPlannedProject(text);
      projectCreated = true;
      setCreatedProjectId(project.id);
      await service.setActiveProject(project.id);
      router.push("/overview");
    } catch (cause) {
      setCreated(projectCreated);
      setError(
        `${projectCreated ? "Your project was created, but setup could not finish. Open its workspace below; no duplicate will be created. " : "Could not create your project. "}${cause instanceof Error ? cause.message : "Please try again."}`,
      );
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="new-tab-screen" aria-label="New Tab">
      <div className="new-tab-inner">
        <h1>Let’s get started</h1>
        <form
          className="project-prompt"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor="project-prompt" className="sr-only">
            Describe your research project
          </label>
          <textarea
            id="project-prompt"
            placeholder="Write a prompt to start a project…"
            value={prompt}
            disabled={busy || created}
            onChange={(event) => setPrompt(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className="prompt-toolbar">
            <span>⌘ / Ctrl + Enter</span>
            <button className="btn" disabled={!prompt.trim() || busy || created}>
              {busy ? "Planning your roadmap…" : "Create project"}
            </button>
          </div>
        </form>
        <p className="prompt-help">
          Describe your research. We’ll give it a concise name and create a Roadmap note with the
          concepts to learn and real papers to read, in order. Planning takes about a minute.
        </p>
        {error && (
          <div className="prompt-error" role="alert">
            {error}
            {created && (
              <Link
                className="btn"
                href="/overview"
                onClick={(event) => {
                  event.preventDefault();
                  void service
                    .setActiveProject(createdProjectId)
                    .then(() => router.push("/overview"));
                }}
              >
                Open created project
              </Link>
            )}
          </div>
        )}
        <nav className="new-tab-actions" aria-label="Research quick actions">
          <button onClick={onNewProject}>New Research Project</button>
          <button onClick={onBrowse}>Browse Existing Projects</button>
          <Link href="/library">Upload Research Source</Link>
          <Link href="/library">Open Research Library</Link>
          <Link href="/roadmap">Explore Knowledge Roadmap</Link>
          <button onClick={() => setAssistantOpen(true)}>Ask AI</button>
          <Link href="/notes">Open Notes</Link>
          <Link href="/overview">Continue Research</Link>
        </nav>
      </div>
    </section>
  );
}
