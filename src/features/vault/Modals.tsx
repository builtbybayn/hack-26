"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import type { VaultEntry } from "@/types/vault";
import { KindIcon } from "./SidePanes";
import { updateSettings, useSettings, type VaultSettings } from "./use-settings";
import { folderPath } from "./vault-tree";

function Modal({
  title,
  onClose,
  children,
  className,
}: {
  title?: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    if (!ref.current?.contains(document.activeElement))
      ref.current?.querySelector<HTMLElement>("input, button, select")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="modal-container" onMouseDown={onClose}>
      <div
        ref={ref}
        className={`modal ${className ?? ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {title && (
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <button
              type="button"
              className="clickable-icon modal-close"
              aria-label="Close"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

/** Subsequence match score: higher for consecutive and early matches. -1 when it doesn't match. */
export function fuzzyScore(query: string, text: string): number {
  const needle = query.toLowerCase().replace(/\s+/g, "");
  const haystack = text.toLowerCase();
  if (!needle) return 0;
  let score = 0;
  let position = -1;
  let streak = 0;
  for (const character of needle) {
    const next = haystack.indexOf(character, position + 1);
    if (next === -1) return -1;
    streak = next === position + 1 ? streak + 1 : 0;
    score += 1 + streak * 2 - Math.min(next - position - 1, 10) * 0.1;
    position = next;
  }
  return score - haystack.length * 0.01;
}

/** Obsidian's quick switcher (Ctrl+O): jump to any paper, note, or chat by name. */
export function QuickSwitcher({
  entries,
  onOpen,
  onCreateNote,
  onClose,
}: {
  entries: VaultEntry[];
  onOpen: (entry: VaultEntry, newTab: boolean) => void;
  onCreateNote: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const results = useMemo(() => {
    const files = entries.filter((entry) => entry.kind !== "folder");
    if (!query.trim())
      return [...files].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 20);
    return files
      .map((entry) => ({ entry, score: fuzzyScore(query, entry.name) }))
      .filter((result) => result.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((result) => result.entry);
  }, [entries, query]);
  const selected = Math.min(index, Math.max(results.length - 1, 0));

  const choose = (entry: VaultEntry | undefined, newTab: boolean) => {
    onClose();
    if (entry) onOpen(entry, newTab);
    else if (query.trim()) onCreateNote(query.trim());
  };

  return (
    <Modal onClose={onClose} className="prompt">
      <div className="prompt-input-container">
        <input
          className="prompt-input"
          autoFocus
          aria-label="Find a file"
          placeholder="Find or create a note…"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setIndex((selected + 1) % Math.max(results.length, 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setIndex((selected - 1 + results.length) % Math.max(results.length, 1));
            } else if (event.key === "Enter") {
              event.preventDefault();
              choose(results[selected], event.ctrlKey || event.metaKey);
            }
          }}
        />
      </div>
      <div className="prompt-results" role="listbox">
        {results.map((entry, resultIndex) => (
          <button
            type="button"
            key={entry.id}
            role="option"
            aria-selected={resultIndex === selected}
            className="suggestion-item"
            onMouseEnter={() => setIndex(resultIndex)}
            onClick={(event) => choose(entry, event.ctrlKey || event.metaKey)}
          >
            <KindIcon entry={entry} />
            <span className="suggestion-title">{entry.name}</span>
            <span className="suggestion-note">{folderPath(entries, entry.id).join(" / ")}</span>
          </button>
        ))}
        {!results.length && query.trim() && (
          <button
            type="button"
            role="option"
            className="suggestion-item"
            aria-selected
            onClick={() => choose(undefined, false)}
          >
            <span className="suggestion-title">Create note “{query.trim()}”</span>
            <span className="suggestion-note">Enter</span>
          </button>
        )}
      </div>
      <div className="prompt-instructions">
        <span>
          <kbd>↑↓</kbd> to navigate
        </span>
        <span>
          <kbd>↵</kbd> to open
        </span>
        <span>
          <kbd>Ctrl ↵</kbd> to open in new tab
        </span>
        <span>
          <kbd>esc</kbd> to dismiss
        </span>
      </div>
    </Modal>
  );
}

export function ConfirmDelete({
  entry,
  count,
  onConfirm,
  onClose,
}: {
  entry: VaultEntry;
  count: number;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const what =
    entry.kind === "folder"
      ? `the folder “${entry.name}” and the ${count - 1} item${count === 2 ? "" : "s"} in it`
      : `“${entry.name}”`;
  return (
    <Modal title={entry.kind === "folder" ? "Delete folder" : "Delete file"} onClose={onClose}>
      <p className="modal-text">
        Are you sure you want to delete {what}?{" "}
        {(entry.kind === "paper" || entry.kind === "folder") &&
          "Deleted papers lose their file, analysis, highlights, and comments."}
      </p>
      <div className="modal-button-container">
        <button
          type="button"
          className="mod-warning"
          onClick={() => {
            onClose();
            onConfirm();
          }}
        >
          Delete
        </button>
        <button type="button" className="mod-muted" onClick={onClose}>
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useSettings();
  return (
    <Modal title="Settings" onClose={onClose} className="settings-modal">
      <SettingItem name="Your name" description="Shown on your comments.">
        <input
          type="text"
          value={settings.authorName}
          maxLength={60}
          onChange={(event) => updateSettings({ authorName: event.target.value })}
          onBlur={(event) => !event.target.value.trim() && updateSettings({ authorName: "You" })}
        />
      </SettingItem>
      <SettingItem name="Vault name" description="Shown at the bottom of the sidebar.">
        <input
          type="text"
          value={settings.vaultName}
          maxLength={40}
          onChange={(event) => updateSettings({ vaultName: event.target.value })}
          onBlur={(event) =>
            !event.target.value.trim() && updateSettings({ vaultName: "research" })
          }
        />
      </SettingItem>
      <SettingItem name="Appearance" description="Dark matches Obsidian's default theme.">
        <select
          className="dropdown"
          value={settings.theme}
          onChange={(event) =>
            updateSettings({ theme: event.target.value as VaultSettings["theme"] })
          }
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
          <option value="system">Adapt to system</option>
        </select>
      </SettingItem>
      <SettingItem
        name="Storage"
        description="Your vault is stored in this browser only. Clearing site data for this app deletes it."
      >
        <span />
      </SettingItem>
      <SettingItem
        name="Classic workspace"
        description="The original single-page view with the concept map and quizzes."
      >
        <a className="mod-muted button-link" href="/classic">
          Open
        </a>
      </SettingItem>
    </Modal>
  );
}

function SettingItem({
  name,
  description,
  children,
}: {
  name: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-item">
      <div className="setting-item-info">
        <div className="setting-item-name">{name}</div>
        <div className="setting-item-description">{description}</div>
      </div>
      <div className="setting-item-control">{children}</div>
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Ctrl+O", "Quick switcher: open any paper, note, or chat"],
  ["Alt+N", "New note"],
  ["Alt+C", "New chat"],
  ["Ctrl+Shift+F", "Search the vault"],
  ["Ctrl+E", "Toggle reading and editing view (notes)"],
  ["Ctrl+Z / Ctrl+Shift+Z", "Undo or redo a highlight or comment (papers)"],
  ["Ctrl+Enter", "Save a comment"],
  ["Ctrl+click", "Open in a new tab"],
  ["F2", "Rename the selected file"],
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Help" onClose={onClose}>
      <p className="modal-text">
        Import a PDF with the upload button, or save one from the Chrome extension. Select text in a
        paper to highlight it, comment in the margin, or ask the AI about it.
      </p>
      <h3 className="modal-subtitle">Keyboard shortcuts</h3>
      <dl className="shortcut-list">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys}>
            <dt>
              <kbd>{keys}</kbd>
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
