"use client";
import { ArrowUp, BookOpen, FilePlus2, RefreshCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";
import { inlineCitation, locationLabel } from "@/features/workspace/lib/service";
import { SourceLink } from "./views/shared";
import { Markdown } from "@/features/vault/Markdown";

export function AssistantPanel() {
  const {
    data,
    service,
    assistantOpen,
    setAssistantOpen,
    scope,
    setScope,
    selection,
    queuedPrompt,
    setQueuedPrompt,
    activeDocumentId,
    setNotice,
  } = useWorkspace();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState("");
  const [conceptName, setConceptName] = useState("");
  const [citationSource, setCitationSource] = useState("");
  const handled = useRef("");
  const document = data.documents.find((item) => item.id === activeDocumentId);
  const lastAnswer = [...data.conversation.messages]
    .reverse()
    .find((item) => item.role === "assistant");
  const ask = useCallback(
    async (text = question) => {
      if (!text.trim() || busy) return;
      setLast(text);
      setQuestion("");
      setError("");
      setBusy(true);
      try {
        await service.ask(
          text,
          scope,
          scope === "selection"
            ? selection
            : scope === "document"
              ? { documentId: activeDocumentId }
              : undefined,
        );
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The assistant could not complete this task.",
        );
      } finally {
        setBusy(false);
      }
    },
    [question, busy, service, scope, selection, activeDocumentId],
  );
  useEffect(() => {
    if (!assistantOpen || busy || !queuedPrompt || handled.current === queuedPrompt.id) return;
    handled.current = queuedPrompt.id;
    setQueuedPrompt(undefined);
    void ask(queuedPrompt.text);
  }, [assistantOpen, queuedPrompt, busy, ask, setQueuedPrompt]);
  async function saveLast() {
    if (!lastAnswer) return;
    try {
      await service.saveNote({
        projectId: data.activeProjectId,
        title: "Assistant finding to review",
        body: lastAnswer.text,
        location: lastAnswer.citations?.[0] || lastAnswer.location,
        question: false,
        resolved: false,
      });
      setNotice("Assistant finding saved as a note for review.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not save note.");
    }
  }
  async function addRoadmap() {
    if (!lastAnswer || !conceptName.trim()) return;
    const location =
      lastAnswer.citations?.[0] ||
      (document?.projectId === data.activeProjectId ? { documentId: document.id } : undefined);
    if (!location) {
      setNotice("Add a source to this project before creating a located prerequisite.");
      return;
    }
    try {
      await service.saveConcept({
        projectId: data.activeProjectId,
        name: conceptName.trim(),
        why: lastAnswer.text,
        refresher: "Review this concept against the linked source before marking it understood.",
        requires: [],
        location,
        status: "to-learn",
        origin: "inferred",
        order: data.concepts.filter((item) => item.projectId === data.activeProjectId).length + 1,
      });
      setNotice("Inferred prerequisite added to roadmap for review.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not add prerequisite.");
    }
  }
  async function citeLast() {
    const id = citationSource || lastAnswer?.citations?.[0]?.documentId;
    const source = data.documents.find((item) => item.id === id);
    if (!source) return;
    try {
      await service.saveDraft({
        body: `${data.draft.body} ${inlineCitation(source)}`,
        citations: data.draft.citations.some((item) => item.documentId === source.id)
          ? data.draft.citations
          : [...data.draft.citations, { documentId: source.id }],
      });
      setNotice("Source citation inserted into draft for review.");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Could not insert citation.");
    }
  }
  return assistantOpen ? (
    <section
      className="surface flex h-[min(640px,calc(100dvh-145px))] w-[min(380px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl shadow-[0_24px_70px_#000c]"
      aria-label="Contextual research assistant"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <div>
          <p className="eyebrow">Research assistant</p>
          <h2 className="mt-1 text-base font-semibold">Ask in context</h2>
        </div>
        <button
          className="icon-button assistant-close"
          title="Close research assistant"
          aria-label="Close research assistant"
          onClick={() => setAssistantOpen(false)}
        >
          <X size={18} />
        </button>
      </div>
      <div className="border-b border-line bg-[#1e1e1e] px-5 py-3">
        <label className="text-xs text-muted" htmlFor="assistant-scope">
          Using context from
        </label>
        <select
          id="assistant-scope"
          className="input mt-1 text-xs"
          value={scope}
          onChange={(event) => setScope(event.target.value as typeof scope)}
        >
          <option value="project">
            Project · {data.projects.find((item) => item.id === data.activeProjectId)?.name}
          </option>
          <option value="document">Document · {document?.title || "current document"}</option>
          <option value="selection" disabled={!selection}>
            Selected passage ·{" "}
            {selection
              ? locationLabel(
                  data.documents.find((item) => item.id === selection.documentId),
                  selection,
                )
              : "select text in reader"}
          </option>
        </select>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
        <div className="rounded-xl border border-[#363636] bg-[#1e1e1e] p-3 text-sm leading-relaxed text-[#d4d4d4]">
          <BookOpen size={16} className="mb-2 text-neutral" />
          Ask about a prerequisite, check a claim, or cite a passage. Suggestions are reviewable
          before being added to your work.
        </div>
        {data.conversation.messages.map((message) => (
          <div
            key={message.id}
            className={`rounded-xl p-3 text-sm leading-relaxed ${message.role === "user" ? "ml-7 bg-[#262626]" : "mr-7 border border-line bg-[#1e1e1e]"}`}
          >
            <p className="mb-1 text-[10px] font-bold tracking-widest text-neutral uppercase">
              {message.role === "user" ? "You" : "Assistant"}
            </p>
            <Markdown source={message.text} />
            {message.citations?.length ? (
              <div className="mt-3 space-y-1 border-t border-line pt-2">
                {message.citations.map((location, index) => (
                  <div key={index}>
                    <SourceLink location={location} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {busy && (
          <p className="text-xs text-neutral" role="status">
            {last.toLowerCase().includes("compare") || last.toLowerCase().includes("claim")
              ? "Analyzing saved sources."
              : "Checking project context."}
          </p>
        )}
        {error && (
          <div
            className="rounded-lg border border-neutral bg-neutral/40 p-3 text-sm text-neutral"
            role="alert"
          >
            {error}
            <button className="btn mt-3 block" onClick={() => void ask(last)}>
              <RefreshCcw size={14} /> Retry
            </button>
          </div>
        )}
      </div>
      <div className="border-t border-line p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          <button
            className="btn btn-quiet text-xs"
            onClick={() => void ask("Explain prerequisites for this passage")}
            disabled={busy}
          >
            Explain prerequisites
          </button>
          <button
            className="btn btn-quiet text-xs"
            onClick={() => void ask("Compare this claim with saved sources")}
            disabled={busy}
          >
            Check claim
          </button>
        </div>
        {lastAnswer && (
          <div className="mb-3 rounded-lg border border-line p-2">
            <div className="flex flex-wrap gap-2">
              <button className="btn text-xs" onClick={() => void saveLast()}>
                <FilePlus2 size={13} /> Save finding
              </button>
              <button
                className="btn text-xs"
                onClick={() => void addRoadmap()}
                disabled={!conceptName.trim()}
              >
                Add to roadmap
              </button>
            </div>
            <label className="mt-2 block text-[11px] text-muted">
              Prerequisite name
              <input
                className="input mt-1 min-h-8 text-xs"
                value={conceptName}
                onChange={(event) => setConceptName(event.target.value)}
              />
            </label>
            {lastAnswer.citations?.length ? (
              <div className="mt-2 flex gap-2">
                <select
                  className="input min-w-0 flex-1 text-xs"
                  aria-label="Citation source"
                  value={citationSource}
                  onChange={(event) => setCitationSource(event.target.value)}
                >
                  <option value="">First cited source</option>
                  {lastAnswer.citations.map((location) => (
                    <option key={location.documentId} value={location.documentId}>
                      {data.documents.find((item) => item.id === location.documentId)?.title}
                    </option>
                  ))}
                </select>
                <button className="btn text-xs" onClick={() => void citeLast()}>
                  Cite in draft
                </button>
              </div>
            ) : null}
          </div>
        )}
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <label className="sr-only" htmlFor="assistant-question">
            Ask a question
          </label>
          <input
            id="assistant-question"
            className="input"
            placeholder="Ask about this research…"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary shrink-0 px-3"
            disabled={busy || !question.trim()}
            aria-label="Send question"
          >
            <ArrowUp size={17} />
          </button>
        </form>
      </div>
    </section>
  ) : null;
}
