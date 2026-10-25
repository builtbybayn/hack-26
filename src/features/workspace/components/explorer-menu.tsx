"use client";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Quote, RotateCcw, Trash2, X } from "lucide-react";
import type { TrashItem } from "../lib/models";
import "./explorer-menu.css";

export interface ExplorerTarget {
  id: string;
  name: string;
  kind: TrashItem["kind"];
  projectId?: string;
}
export interface ExplorerMenuState {
  target: ExplorerTarget;
  x: number;
  y: number;
}

function dialogKeys(event: KeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
  if (event.key !== "Tab") return;
  const fields = [
    ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
  ];
  const first = fields[0],
    last = fields.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

export function ExplorerContextMenu({
  menu,
  onClose,
  onOpen,
  onDelete,
  onCopyCitation,
}: {
  menu: ExplorerMenuState;
  onClose: () => void;
  onOpen: () => void;
  onDelete: () => void;
  /** Sources only: copy a BibTeX citation. */
  onCopyCitation?: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [menu.target.id]);
  return createPortal(
    <>
      <button
        className="explorer-menu-dismiss"
        aria-label="Dismiss context menu"
        onClick={onClose}
      />
      <div
        ref={root}
        role="menu"
        aria-label={`${menu.target.name} actions`}
        className="explorer-context-menu"
        style={{
          left: Math.max(8, Math.min(menu.x, window.innerWidth - 228)),
          top: Math.max(8, Math.min(menu.y, window.innerHeight - 150)),
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" || event.key === "Tab") {
            event.preventDefault();
            onClose();
          }
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const items = [
            ...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]"),
          ];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? items.length - 1
                : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[next]?.focus();
        }}
      >
        <div className="explorer-menu-title">{menu.target.name}</div>
        <button role="menuitem" onClick={onOpen}>
          <ExternalLink size={14} /> Open
        </button>
        {onCopyCitation && (
          <button role="menuitem" onClick={onCopyCitation}>
            <Quote size={14} /> Copy citation (BibTeX)
          </button>
        )}
        <hr />
        <button role="menuitem" className="explorer-menu-delete" onClick={onDelete}>
          <Trash2 size={14} /> Delete
        </button>
      </div>
    </>,
    document.body,
  );
}

export function ConfirmTrash({
  target,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  target: ExplorerTarget;
  busy: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div
      className="workspace-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="trash-confirm-title"
        className="workspace-trash-dialog"
        onKeyDown={(event) =>
          dialogKeys(event, () => {
            if (!busy) onClose();
          })
        }
      >
        <h2 id="trash-confirm-title">Move “{target.name}” to Trash?</h2>
        <p>
          Its folders, notes, and sources will be moved with it. You can restore them from Trash.
        </p>
        {error && (
          <p className="trash-dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="trash-dialog-actions">
          <button className="btn" autoFocus disabled={busy} onClick={onClose}>
            Cancel
          </button>
          <button className="btn" disabled={busy} onClick={onConfirm}>
            <Trash2 size={14} /> {busy ? "Moving…" : "Move to Trash"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function TrashDialog({
  items,
  busy,
  error,
  onRestore,
  onClose,
}: {
  items: TrashItem[];
  busy: boolean;
  error?: string;
  onRestore: (id: string) => void;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="workspace-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-trash-title"
        className="workspace-trash-dialog"
        onKeyDown={(event) => dialogKeys(event, onClose)}
      >
        <header className="trash-dialog-header">
          <h2 id="workspace-trash-title">Trash</h2>
          <button className="icon-button" autoFocus aria-label="Close Trash" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <p>
          Restore deleted items and their contents. Saved PDF files and annotations are preserved.
        </p>
        {error && (
          <p className="trash-dialog-error" role="alert">
            {error}
          </p>
        )}
        <div className="trash-item-list">
          {items.length ? (
            items.map((item) => (
              <div className="trash-item" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.kind} · {new Date(item.trashedAt).toLocaleDateString()}
                  </small>
                </div>
                <button className="btn" disabled={busy} onClick={() => onRestore(item.id)}>
                  <RotateCcw size={14} /> Restore
                </button>
              </div>
            ))
          ) : (
            <p>Trash is empty.</p>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
