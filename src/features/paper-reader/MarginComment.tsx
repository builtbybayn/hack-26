"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Ellipsis } from "lucide-react";
import type { Annotation } from "@/types/vault";

interface MarginCommentProps {
  annotation: Annotation;
  top: number;
  active: boolean;
  editing: boolean;
  onMeasure: (id: string, height: number) => void;
  onActivate: () => void;
  onEdit: () => void;
  onSave: (comment: string) => void;
  onCancel: () => void;
  onDeleteComment: () => void;
  onAskAi: () => void;
}

/** A comment card in the page margin, beside its highlight (like Google Docs). */
export function MarginComment(props: MarginCommentProps) {
  const { annotation, editing } = props;
  const ref = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { onMeasure } = props;

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => onMeasure(annotation.id, element.offsetHeight));
    observer.observe(element);
    return () => observer.disconnect();
  }, [annotation.id, onMeasure]);

  return (
    <article
      ref={ref}
      className="margin-comment"
      data-active={props.active || undefined}
      data-color={annotation.color}
      style={{ top: props.top }}
      onClick={props.onActivate}
    >
      <header>
        <span className="avatar" aria-hidden>
          {annotation.author.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <span className="margin-comment-meta">
          <strong>{annotation.author}</strong>
          <time dateTime={annotation.updatedAt}>{formatWhen(annotation.updatedAt)}</time>
        </span>
        {!editing && (
          <span className="margin-comment-menu">
            <button
              type="button"
              className="clickable-icon"
              aria-label="Comment actions"
              aria-expanded={menuOpen}
              onClick={(event) => {
                event.stopPropagation();
                setMenuOpen((open) => !open);
              }}
            >
              <Ellipsis size={16} />
            </button>
            {menuOpen && (
              <span className="menu" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                <button type="button" role="menuitem" onClick={props.onEdit}>
                  Edit
                </button>
                <button type="button" role="menuitem" onClick={props.onAskAi}>
                  Ask AI about this
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="is-warning"
                  onClick={props.onDeleteComment}
                >
                  Delete comment
                </button>
              </span>
            )}
          </span>
        )}
      </header>
      {editing ? (
        <CommentEditor
          initial={annotation.comment ?? ""}
          onSave={props.onSave}
          onCancel={props.onCancel}
        />
      ) : (
        <p className="margin-comment-text">{annotation.comment}</p>
      )}
    </article>
  );
}

function CommentEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (comment: string) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial);
  const save = () => (text.trim() ? onSave(text.trim()) : onCancel());
  return (
    <div className="comment-editor">
      <textarea
        autoFocus
        aria-label="Comment"
        placeholder="Add a comment…"
        value={text}
        rows={3}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) save();
          if (event.key === "Escape") onCancel();
        }}
      />
      <div className="comment-editor-actions">
        <button type="button" className="mod-muted" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="mod-cta" onClick={save} disabled={!text.trim()}>
          Comment
        </button>
      </div>
    </div>
  );
}

/** "8:24 PM Today", "Yesterday", or a date, like the mockup. */
export function formatWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const days = Math.round(
    (new Date(now.toDateString()).getTime() - new Date(date.toDateString()).getTime()) / 86_400_000,
  );
  if (days === 0) return `${time} Today`;
  if (days === 1) return `${time} Yesterday`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}
