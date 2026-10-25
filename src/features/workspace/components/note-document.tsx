"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, FilePenLine, Plus } from "lucide-react";
import type { Note } from "../lib/models";
import { useWorkspace } from "../lib/workspace-context";
import { MarkdownContent } from "./markdown-content";

/** A note is a document: open it, write, and let browser persistence follow the edits. */
export function NoteDocument({ note }: { note: Note }) {
  const { data, service, createNote, setNotice } = useWorkspace();
  const [preview, setPreview] = useState(note.title.trim().toLowerCase() === "roadmap");
  const [edit, setEdit] = useState({ value: note, base: note, revision: 0, dirty: false });
  const [error, setError] = useState("");
  const editorId = useId();
  const bodyField = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<typeof edit | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const roadmap = edit.value.title.trim().toLowerCase() === "roadmap";
  const project = data.projects.find((item) => item.id === note.projectId);

  useEffect(() => {
    if (!preview) bodyField.current?.focus({ preventScroll: true });
  }, [preview]);

  if (!edit.dirty && note.updatedAt !== edit.base.updatedAt) {
    setEdit({ value: note, base: note, revision: edit.revision + 1, dirty: false });
  }

  const persist = useCallback(
    (snapshot: typeof edit) => {
      const operation = queue.current.then(() =>
        service.saveNote({
          ...snapshot.value,
          title: snapshot.value.title.trim() || "Untitled",
        }),
      );
      queue.current = operation.catch(() => {});
      return operation
        .then((saved) => {
          setEdit((current) =>
            current.revision === snapshot.revision
              ? {
                  ...current,
                  base: saved,
                  value: { ...current.value, updatedAt: saved.updatedAt },
                  dirty: false,
                }
              : current,
          );
          setError("");
        })
        .catch((cause) => {
          const message = cause instanceof Error ? cause.message : "Note could not be saved.";
          setError(message);
          setNotice(message);
        });
    },
    [service, setNotice],
  );

  useEffect(() => {
    pending.current = edit.dirty ? edit : null;
  }, [edit]);
  useEffect(() => {
    if (!edit.dirty) return;
    const timer = setTimeout(() => void persist(edit), 500);
    return () => clearTimeout(timer);
  }, [edit, persist]);
  useEffect(
    () => () => {
      if (pending.current) void persist(pending.current);
    },
    [persist],
  );

  function change(patch: Partial<Note>) {
    setError("");
    setEdit((current) => ({
      ...current,
      value: { ...current.value, ...patch },
      revision: current.revision + 1,
      dirty: true,
    }));
  }

  return (
    <section
      className="note-document"
      aria-label="Note editor"
      onKeyDown={(event) => {
        if (!(event.ctrlKey || event.metaKey)) return;
        if (event.key.toLowerCase() === "s") {
          event.preventDefault();
          if (edit.dirty) void persist(edit);
        }
        if (event.key.toLowerCase() === "e") {
          event.preventDefault();
          setPreview((value) => !value);
        }
      }}
    >
      <header className="note-document-toolbar">
        <Link href="/notes" className="btn btn-quiet">
          All notes
        </Link>
        <span className="note-save-status" role="status">
          {error ? "Couldn't save" : edit.dirty ? "Saving…" : "Saved locally"}
        </span>
        {error && (
          <button className="btn" onClick={() => void persist(edit)}>
            Retry save
          </button>
        )}
        <button
          className="btn"
          aria-pressed={preview}
          onClick={() => setPreview((value) => !value)}
          title="Toggle reading view (Ctrl/Cmd+E)"
        >
          {preview ? <FilePenLine size={15} /> : <BookOpen size={15} />}
          {preview ? "Edit" : "Reading view"}
        </button>
        <button className="btn" onClick={() => void createNote()} title="New note (Alt+N)">
          <Plus size={15} /> New note
        </button>
      </header>
      <div className="note-document-page">
        {preview ? (
          <>
            <h1 className="note-document-title">
              {roadmap && project ? `${project.name} · Roadmap` : edit.value.title || "Untitled"}
            </h1>
            {edit.value.body ? (
              <MarkdownContent source={edit.value.body} roadmap={roadmap} />
            ) : (
              <p className="text-muted">This note is empty. Choose Edit to start writing.</p>
            )}
          </>
        ) : (
          <>
            <label className="sr-only" htmlFor={`${editorId}-title`}>
              Note title
            </label>
            <input
              id={`${editorId}-title`}
              className="note-title-input"
              value={edit.value.title}
              placeholder="Untitled"
              onFocus={(event) => {
                if (/^Untitled(?: \d+)?$/.test(event.currentTarget.value))
                  event.currentTarget.select();
              }}
              onChange={(event) => change({ title: event.target.value })}
            />
            <label className="sr-only" htmlFor={`${editorId}-body`}>
              Note body
            </label>
            <textarea
              id={`${editorId}-body`}
              className="note-body-input"
              ref={bodyField}
              value={edit.value.body}
              placeholder="Start writing…"
              onChange={(event) => change({ body: event.target.value })}
            />
          </>
        )}
        <footer className="note-document-footer">
          <label>
            <input
              type="checkbox"
              checked={edit.value.question}
              onChange={(event) => change({ question: event.target.checked })}
            />{" "}
            Track as a question
          </label>
          <span>Markdown · saves automatically</span>
        </footer>
      </div>
    </section>
  );
}
