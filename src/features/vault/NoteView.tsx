"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Pencil } from "lucide-react";
import type { VaultEntry, VaultNote } from "@/types/vault";
import { Markdown } from "./Markdown";
import { findByName, folderPath } from "./vault-tree";

interface NoteViewProps {
  note: VaultNote;
  entries: VaultEntry[];
  onChange: (patch: Partial<VaultNote>) => void;
  onRename: (name: string) => void;
  onOpenLink: (name: string) => void;
}

const SAVE_DELAY_MS = 400;

/** A Markdown note: editing (source) or reading view, toggled like Obsidian (Ctrl+E). */
export function NoteView({ note, entries, onChange, onRename, onOpenLink }: NoteViewProps) {
  const [mode, setMode] = useState<"edit" | "read">("edit");
  const [body, setBody] = useState(note.body);
  const [title, setTitle] = useState(note.name);
  const [syncedId, setSyncedId] = useState(note.id);
  const [syncedName, setSyncedName] = useState(note.name);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Another note opened in this tab: show it (saving happens on the way out, below).
  if (syncedId !== note.id) {
    setSyncedId(note.id);
    setBody(note.body);
  }
  // Renamed elsewhere (e.g. in the file tree).
  if (syncedName !== note.name) {
    setSyncedName(note.name);
    setTitle(note.name);
  }

  // Saves go to the note this view had when the text was typed, even after switching notes.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) onChangeRef.current({ body: pending.current });
    pending.current = null;
  }, []);
  useEffect(() => flush, [note.id, flush]);

  const edit = (value: string) => {
    setBody(value);
    pending.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_DELAY_MS);
  };

  // Grow the editor with its content; the pane scrolls, not the textarea.
  useEffect(() => {
    const element = textRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${element.scrollHeight}px`;
  }, [body, mode]);

  const toggle = () => {
    flush();
    setMode((current) => (current === "edit" ? "read" : "edit"));
  };

  const path = folderPath(entries, note.id);

  return (
    <div
      className="note-view"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
          event.preventDefault();
          toggle();
        }
      }}
    >
      <header className="view-header">
        <div className="view-header-breadcrumbs" title={[...path, note.name].join(" / ")}>
          {path.map((segment, index) => (
            <span key={index} className="breadcrumb">
              {segment}
              <span className="breadcrumb-separator">/</span>
            </span>
          ))}
          <span className="view-header-title">{note.name}</span>
        </div>
        <button
          type="button"
          className="clickable-icon"
          aria-label={mode === "edit" ? "Switch to reading view" : "Switch to editing view"}
          title={`${mode === "edit" ? "Reading view" : "Editing view"} (Ctrl+E)`}
          onClick={toggle}
        >
          {mode === "edit" ? <BookOpen size={18} /> : <Pencil size={18} />}
        </button>
      </header>
      <div className="view-content">
        <div className="note-sizer">
          <input
            className="inline-title"
            aria-label="Note title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => {
              onRename(title);
              setTitle((current) => current.trim() || note.name);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                textRef.current?.focus();
              }
              if (event.key === "Escape") setTitle(note.name);
            }}
          />
          {mode === "edit" ? (
            <textarea
              ref={textRef}
              className="note-editor"
              aria-label="Note"
              placeholder="Start writing… Link other notes and papers with [[Name]]."
              value={body}
              spellCheck
              onChange={(event) => edit(event.target.value)}
              onBlur={() => flush()}
            />
          ) : (
            <div className="markdown-rendered">
              {body.trim() ? (
                <Markdown
                  source={body}
                  onWikiLink={onOpenLink}
                  resolves={(name) => !!findByName(entries, name)}
                />
              ) : (
                <p className="empty-note">This note is empty.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
