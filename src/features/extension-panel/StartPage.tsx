"use client";

/**
 * The panel's start screen off a PDF: one prompt, either to start a research project (a roadmap
 * in the workspace) or to ask the assistant. Kept deliberately quiet.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp } from "lucide-react";

export type StartMode = "project" | "ask";

const SUGGESTIONS: Record<StartMode, string[]> = {
  project: [
    "How transformers learn to reason over long contexts",
    "The evidence on spaced repetition for adult learners",
    "Quantum algorithms for faster reinforcement learning",
  ],
  ask: [
    "What should I read first to understand diffusion models?",
    "Explain the difference between precision and recall",
    "How do I judge whether a paper's sample size is adequate?",
  ],
};

const PLACEHOLDER: Record<StartMode, string> = {
  project: "Describe a topic or question to research…",
  ask: "Ask anything about research or your papers…",
};

export function StartPage({
  onStartProject,
  onAsk,
  continueProject,
  onContinueProject,
}: {
  onStartProject: (idea: string) => void;
  onAsk: (question: string) => void;
  /** A project being shaped earlier, to return to. */
  continueProject?: string | null;
  onContinueProject?: () => void;
}) {
  const [mode, setMode] = useState<StartMode>("project");
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grow with the text, up to a limit.
  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 180)}px`;
  }, [text]);

  const submit = (value = text) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (mode === "project") onStartProject(trimmed);
    else onAsk(trimmed);
  };

  return (
    <section className="ext-start" aria-label="Start">
      <h1 className="ext-start-title">What are you researching?</h1>
      <p className="ext-start-subtitle">
        {mode === "project"
          ? "Start a project with a roadmap of what to learn and read, in order."
          : "Ask the assistant. Answers are saved with your chats."}
      </p>

      <form
        className="ext-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={inputRef}
          rows={2}
          autoFocus
          aria-label={mode === "project" ? "Research topic" : "Question"}
          placeholder={PLACEHOLDER[mode]}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="ext-composer-bar">
          <div className="ext-switch" role="radiogroup" aria-label="Mode">
            {(
              [
                ["project", "Project"],
                ["ask", "Ask"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={mode === id}
                onClick={() => {
                  setMode(id);
                  inputRef.current?.focus();
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="submit"
            className="ext-send-button"
            aria-label={mode === "project" ? "Start project" : "Ask"}
            disabled={!text.trim()}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </form>

      <ul className="ext-suggestions" aria-label="Suggestions">
        {SUGGESTIONS[mode].map((suggestion) => (
          <li key={suggestion}>
            <button type="button" onClick={() => submit(suggestion)}>
              {suggestion}
            </button>
          </li>
        ))}
      </ul>

      {continueProject && onContinueProject && (
        <button type="button" className="ext-continue" onClick={onContinueProject}>
          <span>
            <small>Continue</small>
            {continueProject}
          </span>
          <ArrowRight size={14} aria-hidden />
        </button>
      )}
    </section>
  );
}
