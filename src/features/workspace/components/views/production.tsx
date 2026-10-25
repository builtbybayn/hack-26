"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowRight,
  Bold,
  BookOpen,
  Check,
  FileText,
  Heading1,
  Italic,
  List,
  Plus,
  Printer,
  Quote,
  Save,
  Search,
} from "lucide-react";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";
import { citationText, inlineCitation } from "@/features/workspace/lib/service";
import type { Draft, Note } from "@/features/workspace/lib/models";
import { Empty, PageHeading, SourceLink, Status } from "./shared";
import { MarkdownContent } from "../markdown-content";
import { NoteDocument } from "../note-document";

export function NotesView({ noteId }: { noteId?: string } = {}) {
  const { data, service, setNotice, createNote } = useWorkspace();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "questions">("all");
  const [editing, setEditing] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isQuestion, setIsQuestion] = useState(false);
  const notes = data.notes.filter(
    (note) =>
      note.projectId === data.activeProjectId &&
      (!noteId || note.id === noteId) &&
      (filter === "all" || note.question) &&
      `${note.title} ${note.body}`.toLowerCase().includes(query.toLowerCase()),
  );
  function start(note?: Note) {
    setEditing(
      note || {
        id: "",
        projectId: data.activeProjectId,
        title: "",
        body: "",
        question: false,
        resolved: false,
        updatedAt: "",
      },
    );
    setTitle(note?.title || "");
    setBody(note?.body || "");
    setIsQuestion(note?.question || false);
  }
  const requestedNote = data.notes.find((note) => note.id === noteId);
  async function save() {
    try {
      await service.saveNote({
        id: editing?.id || undefined,
        projectId: data.activeProjectId,
        title,
        body,
        question: isQuestion,
        resolved: editing?.resolved || false,
        location: editing?.location,
        findingId: editing?.findingId,
        conceptId: editing?.conceptId,
      });
      setEditing(null);
      setNotice("Note saved.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save note.");
    }
  }
  async function promote(note: Note) {
    try {
      await service.saveDraft({ body: `${data.draft.body}\n\n## ${note.title}\n${note.body}` });
      setNotice("Note added to the draft for review.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not add note to draft.");
    }
  }
  if (requestedNote) return <NoteDocument key={requestedNote.id} note={requestedNote} />;
  return (
    <>
      <PageHeading
        eyebrow="NOTES & QUESTIONS"
        title="Notes & questions"
        description=""
        action={
          <button className="btn btn-primary" onClick={() => void createNote()}>
            <Plus size={15} /> New note
          </button>
        }
      />
      <div className="notes-toolbar">
        <label className="notes-search">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Search notes</span>
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes and questions…"
          />
        </label>
        <select
          className="input w-auto"
          aria-label="Filter notes"
          value={filter}
          onChange={(event) => setFilter(event.target.value as typeof filter)}
        >
          <option value="all">All notes</option>
          <option value="questions">Questions</option>
        </select>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {notes.map((note) => (
          <article
            key={note.id}
            className={`surface workspace-note-card ${note.title.trim().toLowerCase() === "roadmap" ? "workspace-roadmap-card" : ""}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex gap-2">
                  <span className="tag">
                    {note.question
                      ? "Question"
                      : note.title.trim().toLowerCase() === "roadmap"
                        ? "Research plan"
                        : "Note"}
                  </span>
                  {note.question && <Status status={note.resolved ? "resolved" : "open"} />}
                </div>
                <h2 className="workspace-note-title">{note.title}</h2>
              </div>
              <button className="btn text-xs" onClick={() => start(note)}>
                Edit
              </button>
            </div>
            <MarkdownContent
              source={note.body}
              roadmap={note.title.trim().toLowerCase() === "roadmap"}
            />
            {note.location && (
              <div className="mt-4">
                <SourceLink location={note.location} />
              </div>
            )}
            <details className="research-details">
              <summary>Note actions</summary>
              <div className="flex flex-wrap gap-2 py-3">
                <button className="btn text-xs" onClick={() => void promote(note)}>
                  <FileText size={13} /> Add to draft
                </button>
                {note.question && (
                  <button
                    className="btn text-xs"
                    onClick={() => void service.saveNote({ ...note, resolved: !note.resolved })}
                  >
                    {note.resolved ? "Reopen" : "Mark resolved"}
                  </button>
                )}
                <button
                  className="btn btn-quiet text-xs"
                  onClick={() => {
                    if (confirm("Move this note to Trash? You can restore it from the explorer."))
                      void service.deleteNote(note.id);
                  }}
                >
                  Delete
                </button>
              </div>
            </details>
          </article>
        ))}
        {!notes.length && (
          <div className="lg:col-span-2">
            <Empty
              title={query ? "No notes match your search" : "No notes yet"}
              detail="Create a note or save a finding from the evidence view."
              action={
                <button className="btn btn-primary" onClick={() => void createNote()}>
                  Create a note
                </button>
              }
            />
          </div>
        )}
      </div>
      {editing && (
        <div
          className={
            noteId
              ? "note-editor mt-5"
              : "fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
          }
          role={noteId ? "region" : "dialog"}
          aria-modal={noteId ? undefined : true}
          aria-label="Edit note"
        >
          <form
            className="surface w-full max-w-xl rounded-xl p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <h2 className="text-xl font-semibold">{editing.id ? "Edit note" : "New note"}</h2>
            <label className="mt-5 block text-xs text-muted">
              Title
              <input
                className="input mt-2"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="mt-4 block text-xs text-muted">
              Body
              <textarea
                className="input mt-2 min-h-40"
                value={body}
                onChange={(event) => setBody(event.target.value)}
              />
            </label>
            <label className="mt-4 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isQuestion}
                onChange={(event) => setIsQuestion(event.target.checked)}
              />{" "}
              Track as unresolved question
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" type="submit">
                <Save size={14} /> Save note
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function inlineFormat(line: string) {
  return line
    .split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={index}>{part.slice(2, -2)}</strong>
      ) : part.startsWith("*") && part.endsWith("*") ? (
        <em key={index}>{part.slice(1, -1)}</em>
      ) : (
        part
      ),
    );
}
function renderBody(body: string) {
  return body.split("\n").map((line, index) => {
    if (line.startsWith("# ")) return <h2 key={index}>{line.slice(2)}</h2>;
    if (line.startsWith("## "))
      return (
        <h3 key={index} className="mt-6 text-lg font-semibold">
          {line.slice(3)}
        </h3>
      );
    if (line.startsWith("- "))
      return (
        <li key={index} className="ml-5 list-disc leading-8">
          {inlineFormat(line.slice(2))}
        </li>
      );
    if (!line.trim()) return <div key={index} className="h-3" />;
    return (
      <p key={index} className="leading-8">
        {inlineFormat(line)}
      </p>
    );
  });
}
export function WritingView() {
  const bodyId = useId();
  const { data, service, setScope, setAssistantOpen, setQueuedPrompt, setNotice } = useWorkspace();
  const [mode, setMode] = useState<"draft" | "final">("draft");
  const [side, setSide] = useState(false);
  const [edit, setEdit] = useState({
    value: data.draft,
    base: data.draft,
    revision: 0,
    dirty: false,
  });
  const local = edit.value;
  const saved = edit.dirty ? "saving" : "saved";
  function setLocal(update: Draft | ((current: Draft) => Draft)) {
    setEdit((current) => ({
      ...current,
      value: typeof update === "function" ? update(current.value) : update,
      revision: current.revision + 1,
      dirty: true,
    }));
  }
  // Refresh clean editors; an unrelated storage refresh must never discard unsaved typing.
  if (data.draft.id !== edit.base.id || (!edit.dirty && data.draft !== edit.base)) {
    setEdit({ value: data.draft, base: data.draft, revision: edit.revision + 1, dirty: false });
  }
  const [citationOpen, setCitationOpen] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const pendingDraft = useRef<Draft | null>(null);
  const [saveError, setSaveError] = useState(false);
  useEffect(() => {
    pendingDraft.current = edit.dirty ? edit.value : null;
  }, [edit]);
  useEffect(
    () => () => {
      if (pendingDraft.current)
        void service.saveDraft(pendingDraft.current).catch((error) => setNotice(error.message));
    },
    [service, setNotice],
  );
  useEffect(() => {
    if (!edit.dirty) return;
    const timer = setTimeout(() => {
      void service
        .saveDraft(edit.value)
        .then(() =>
          setEdit((current) =>
            current.revision === edit.revision ? { ...current, dirty: false } : current,
          ),
        )
        .catch((error) => {
          setSaveError(true);
          setNotice(error.message);
        });
    }, 600);
    return () => clearTimeout(timer);
  }, [edit, service, setNotice]);
  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    setSaveError(false);
    setLocal((current) => ({ ...current, [key]: value }));
  }
  function insert(text: string, wrap = false) {
    const field = editor.current;
    if (!field) return;
    const start = field.selectionStart,
      end = field.selectionEnd,
      before = local.body.slice(0, start),
      selected = local.body.slice(start, end),
      after = local.body.slice(end);
    const next = `${before}${wrap ? text + (selected || "text") + text : text}${after}`;
    change("body", next);
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(
        start + text.length,
        start + text.length + (wrap ? (selected || "text").length : 0),
      );
    });
  }
  function cite(id: string) {
    const doc = data.documents.find((item) => item.id === id);
    if (!doc) return;
    const field = editor.current;
    const start = field?.selectionStart ?? local.body.length;
    const end = field?.selectionEnd ?? start;
    const marker = ` ${inlineCitation(doc)}`;
    setLocal((current) => ({
      ...current,
      body: `${current.body.slice(0, start)}${marker}${current.body.slice(end)}`,
      citations: current.citations.some((item) => item.documentId === id)
        ? current.citations
        : [...current.citations, { documentId: id }],
    }));
    setCitationOpen(false);
    setNotice("Citation inserted. Check missing source metadata before submission.");
  }
  const cited = local.citations
    .map((citation) => data.documents.find((item) => item.id === citation.documentId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  return (
    <>
      <div className="no-print">
        <PageHeading
          eyebrow="WRITING WORKSPACE"
          title="Writing workspace"
          description=""
          action={
            <div className="flex gap-2 rounded-lg border border-line bg-surface p-1">
              <button
                className={`btn ${mode === "draft" ? "btn-primary" : "btn-quiet"}`}
                onClick={() => setMode("draft")}
              >
                Draft
              </button>
              <button
                className={`btn ${mode === "final" ? "btn-primary" : "btn-quiet"}`}
                onClick={() => setMode("final")}
              >
                Final
              </button>
            </div>
          }
        />
      </div>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-muted">
          {saved === "saved" ? (
            <Check size={15} className="text-neutral" />
          ) : (
            <span className="h-3 w-3 animate-pulse rounded-full bg-neutral" />
          )}
          {saveError
            ? "Couldn't save — edit again to retry"
            : saved === "saved"
              ? "Saved locally"
              : "Saving…"}{" "}
          <span>· APA 7 initial style</span>
        </div>
        <div className="flex gap-2">
          <button className="btn" onClick={() => setSide(!side)}>
            <BookOpen size={14} />
            {side ? "Hide sources" : "Show sources"}
          </button>
          <button className="btn" onClick={() => setCitationOpen(true)}>
            <Quote size={14} /> Insert citation
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              setMode("final");
              setTimeout(() => window.print(), 100);
            }}
          >
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>
      <div className={`grid gap-5 ${side ? "xl:grid-cols-[minmax(0,1fr)_260px]" : ""}`}>
        <div className="min-w-0">
          {mode === "draft" ? (
            <div className="surface rounded-xl p-5 sm:p-8">
              <div className="mx-auto max-w-[720px]">
                <label className="block text-xs text-muted">
                  Paper title
                  <input
                    className="mt-2 w-full border-0 border-b border-line bg-transparent pb-3 text-2xl font-semibold outline-none focus:border-neutral"
                    value={local.title}
                    onChange={(event) => change("title", event.target.value)}
                  />
                </label>
                <details className="research-details">
                  <summary>Authors & abstract</summary>
                  <label className="mt-5 block text-xs text-muted">
                    Authors
                    <input
                      className="mt-2 w-full border-0 border-b border-line bg-transparent pb-2 text-sm outline-none focus:border-neutral"
                      value={local.authors}
                      onChange={(event) => change("authors", event.target.value)}
                    />
                  </label>
                  <label className="mt-5 block text-xs text-muted">
                    Abstract
                    <textarea
                      className="input mt-2 min-h-24 text-sm leading-7"
                      value={local.abstract}
                      onChange={(event) => change("abstract", event.target.value)}
                    />
                  </label>
                </details>
                <div
                  className="no-print mt-6 flex flex-wrap gap-1 border-y border-line py-2"
                  role="toolbar"
                  aria-label="Draft formatting"
                >
                  <button
                    className="btn btn-quiet px-2"
                    onClick={() => insert("\n# ")}
                    aria-label="Insert heading"
                  >
                    <Heading1 size={16} />
                  </button>
                  <button
                    className="btn btn-quiet px-2"
                    onClick={() => insert("**", true)}
                    aria-label="Bold"
                  >
                    <Bold size={16} />
                  </button>
                  <button
                    className="btn btn-quiet px-2"
                    onClick={() => insert("*", true)}
                    aria-label="Italic"
                  >
                    <Italic size={16} />
                  </button>
                  <button
                    className="btn btn-quiet px-2"
                    onClick={() => insert("\n- ")}
                    aria-label="Insert list item"
                  >
                    <List size={16} />
                  </button>
                  <span className="ml-auto self-center text-[11px] text-muted">
                    Markdown formatting
                  </span>
                </div>
                <label className="sr-only" htmlFor={bodyId}>
                  Paper body
                </label>
                <textarea
                  id={bodyId}
                  ref={editor}
                  className="mt-5 min-h-[560px] w-full resize-y border-0 bg-transparent font-[Georgia,serif] text-[17px] leading-8 text-[#d4d4d4] outline-none"
                  spellCheck
                  value={local.body}
                  onChange={(event) => change("body", event.target.value)}
                />
                <div className="border-t border-line pt-3 text-xs text-muted">
                  Use # for a heading, - for a list, **bold**, and *italic*. Changes save
                  automatically.
                </div>
              </div>
            </div>
          ) : (
            <article className="print-paper mx-auto max-w-[780px] rounded-lg bg-[#d4d4d4] px-7 py-10 font-[Georgia,serif] text-[#252525] shadow-2xl sm:px-14 sm:py-16">
              <header className="text-center">
                <h1 className="text-2xl leading-tight font-bold">
                  {local.title || "Untitled paper"}
                </h1>
                <p className="mt-4 text-sm">{local.authors || "Author information missing"}</p>
                <p className="mt-1 text-xs">Fluid Research · APA 7 initial format</p>
              </header>
              <section className="mt-12">
                <h2 className="text-center text-base font-bold">Abstract</h2>
                <p className="mt-3 text-sm leading-7">{local.abstract || "Abstract missing."}</p>
              </section>
              <div className="mt-12 text-[15px] leading-8">{renderBody(local.body)}</div>
              <section className="mt-12 border-t border-[#aaa] pt-7">
                <h2 className="text-center text-base font-bold">References</h2>
                {cited.length ? (
                  cited.map((doc) => (
                    <p key={doc.id} className="mt-3 pl-6 [text-indent:-1.5rem] text-sm leading-6">
                      {citationText(doc)}{" "}
                      {(!doc.authors.length || !doc.venue) && (
                        <span className="font-sans text-xs text-neutral">
                          [Incomplete metadata]
                        </span>
                      )}
                    </p>
                  ))
                ) : (
                  <p className="mt-4 text-sm italic">No citations inserted yet.</p>
                )}
              </section>
            </article>
          )}
        </div>
        {side && (
          <aside className="no-print space-y-4">
            <section className="surface rounded-xl p-4">
              <p className="eyebrow">DRAFT OUTLINE</p>
              <div className="mt-4 space-y-2">
                {local.body
                  .split("\n")
                  .filter((line) => line.startsWith("#"))
                  .map((line, index) => (
                    <p key={index} className="text-xs text-[#d4d4d4]">
                      {line.replace(/^#+ /, "")}
                    </p>
                  ))}
              </div>
            </section>
            <section className="surface rounded-xl p-4">
              <p className="eyebrow">SOURCE SHELF</p>
              <div className="mt-4 space-y-4">
                {data.documents
                  .filter(
                    (item) => item.projectId === data.activeProjectId && item.status === "ready",
                  )
                  .slice(0, 5)
                  .map((doc) => (
                    <div key={doc.id} className="border-b border-line pb-3 last:border-0">
                      <p className="text-xs font-semibold">{doc.title}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        {doc.authors.join(", ") || "Metadata missing"}
                        {doc.demo ? " · Fictional demo" : ""}
                      </p>
                      <button className="mt-2 text-xs text-neutral" onClick={() => cite(doc.id)}>
                        Insert citation <ArrowRight size={12} className="inline" />
                      </button>
                    </div>
                  ))}
              </div>
            </section>
            <button
              className="btn w-full"
              onClick={() => {
                setAssistantOpen(true);
                setScope("project");
                setQueuedPrompt({
                  id: crypto.randomUUID(),
                  text: `Review this working draft. Identify unclear reasoning and claims that need source support.\n\n${local.title}\n\n${local.abstract}\n\n${local.body}`,
                });
              }}
            >
              Ask assistant about draft
            </button>
          </aside>
        )}
      </div>
      {citationOpen && (
        <div
          className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Insert citation"
        >
          <div className="surface max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl p-6">
            <h2 className="text-xl font-semibold">Insert a source citation</h2>
            <p className="mt-2 text-xs text-muted">
              Uses saved metadata only. Missing fields are flagged in Final.
            </p>
            <div className="mt-5 space-y-2">
              {data.documents
                .filter((item) => item.projectId === data.activeProjectId)
                .map((doc) => (
                  <button
                    key={doc.id}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-line p-3 text-left hover:border-neutral"
                    onClick={() => cite(doc.id)}
                  >
                    <span>
                      <strong className="block text-sm">{doc.title}</strong>
                      <small className="mt-1 block text-muted">
                        {inlineCitation(doc)}
                        {doc.demo ? " · Fictional demo" : ""}
                      </small>
                    </span>
                    <Plus size={15} className="shrink-0 text-neutral" />
                  </button>
                ))}
            </div>
            <button className="btn mt-5" onClick={() => setCitationOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ExtensionView() {
  const { data, service, setNotice } = useWorkspace();
  const [quick, setQuick] = useState("");
  const [saving, setSaving] = useState(false);
  async function saveQuickNote() {
    if (!quick.trim() || saving) return;
    setSaving(true);
    try {
      await service.saveNote({
        projectId: data.activeProjectId,
        title: "Browser research note",
        body: quick.trim(),
        question: false,
        resolved: false,
      });
      setQuick("");
      setNotice("Note saved to this project.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save note.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="BROWSER COMPANION"
        title="Browser companion"
        description="Read, capture, and discuss papers alongside the pages you visit."
      />
      <section className="surface rounded-xl p-6">
        <h2 className="text-lg font-semibold">Open the research assistant</h2>
        <p className="mt-3 text-sm leading-7 text-muted">
          The Fluid Research browser extension opens the assistant beside your current tab. It can
          save an accessible page or PDF, analyze its concepts, and open the saved paper in this
          workspace. The panel and workspace share this browser’s saved data when they use the same
          app address.
        </p>
        <Link className="btn btn-primary mt-5" href="/panel" target="_blank">
          Open assistant panel <ArrowRight size={14} />
        </Link>
        <p className="mt-3 text-xs text-muted">
          Capturing the current browser tab requires the installed extension. The standalone panel
          supports chat and file uploads.
        </p>
      </section>
      <section className="surface mt-5 rounded-xl p-6">
        <h2 className="text-lg font-semibold">Capture a research note</h2>
        <p className="mt-2 text-xs text-muted">
          Saved to {data.projects.find((project) => project.id === data.activeProjectId)?.name}.
        </p>
        <label className="mt-4 block text-sm">
          Note
          <textarea
            className="input mt-2 min-h-32"
            value={quick}
            onChange={(event) => setQuick(event.target.value)}
            placeholder="Capture a thought from your reading…"
          />
        </label>
        <button
          className="btn btn-primary mt-3"
          onClick={() => void saveQuickNote()}
          disabled={saving || !quick.trim()}
        >
          <Save size={14} /> {saving ? "Saving…" : "Save note"}
        </button>
      </section>
    </>
  );
}
