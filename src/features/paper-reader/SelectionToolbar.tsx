"use client";

import type { CSSProperties } from "react";
import { Highlighter, MessageSquarePlus, Sparkles, Trash } from "lucide-react";
import type { HighlightColor } from "@/types/vault";

export const HIGHLIGHT_COLORS: { color: HighlightColor; label: string }[] = [
  { color: "yellow", label: "Yellow" },
  { color: "green", label: "Green" },
  { color: "blue", label: "Blue" },
  { color: "pink", label: "Pink" },
];

interface SelectionToolbarProps {
  style: CSSProperties;
  color: HighlightColor;
  hasComment: boolean;
  onColor: (color: HighlightColor) => void;
  /** Null for an existing highlight (it's already highlighted). */
  onHighlight: (() => void) | null;
  onComment: () => void;
  onAskAi: () => void;
  /** Null for a fresh selection (nothing to delete yet). */
  onDelete: (() => void) | null;
}

/** Floats above selected text or a clicked highlight: Ask AI, highlight, comment. */
export function SelectionToolbar(props: SelectionToolbarProps) {
  return (
    <div
      className="selection-toolbar"
      role="toolbar"
      aria-label="Selection actions"
      style={props.style}
      // Keep the text selection while pressing toolbar buttons.
      onMouseDown={(event) => event.preventDefault()}
    >
      <button type="button" className="selection-action is-ai" onClick={props.onAskAi}>
        <Sparkles size={15} />
        <span>Ask AI</span>
      </button>
      <span className="toolbar-divider" aria-hidden />
      {props.onHighlight && (
        <button
          type="button"
          className="clickable-icon"
          aria-label="Highlight"
          title="Highlight"
          onClick={props.onHighlight}
        >
          <Highlighter size={16} />
        </button>
      )}
      <span className="swatches" role="group" aria-label="Highlight color">
        {HIGHLIGHT_COLORS.map(({ color, label }) => (
          <button
            type="button"
            key={color}
            className="swatch"
            data-color={color}
            aria-label={`${label} highlight`}
            aria-pressed={!props.onHighlight && props.color === color}
            title={label}
            onClick={() => props.onColor(color)}
          />
        ))}
      </span>
      <span className="toolbar-divider" aria-hidden />
      <button
        type="button"
        className="clickable-icon"
        aria-label={props.hasComment ? "Edit comment" : "Comment"}
        title={props.hasComment ? "Edit comment" : "Comment"}
        onClick={props.onComment}
      >
        <MessageSquarePlus size={16} />
      </button>
      {props.onDelete && (
        <button
          type="button"
          className="clickable-icon"
          aria-label="Remove highlight"
          title="Remove highlight"
          onClick={props.onDelete}
        >
          <Trash size={16} />
        </button>
      )}
    </div>
  );
}
