"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";

export function NewTab() {
  const { service, setAssistantOpen } = useWorkspace();
  const router = useRouter();
  const promptId = useId();
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
        <h1>What are you researching?</h1>
        <form
          className="project-prompt"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label htmlFor={promptId} className="sr-only">
            Describe your research project
          </label>
          <textarea
            id={promptId}
            placeholder="Describe a topic or question. You’ll get a project with a roadmap of what to learn and read."
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
            <span>{busy ? "Planning takes about a minute." : ""}</span>
            <button className="btn btn-primary" disabled={!prompt.trim() || busy || created}>
              {busy ? "Planning…" : "Start project"}
            </button>
          </div>
        </form>
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
        <nav className="new-tab-links" aria-label="Shortcuts">
          <Link href="/library">Library</Link>
          <Link href="/graph?mode=brain">Graph</Link>
          <button onClick={() => setAssistantOpen(true)}>Ask AI</button>
        </nav>
      </div>
    </section>
  );
}
