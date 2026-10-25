"use client";
import { ArrowUp, ChevronDown, Plus, RefreshCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";
import { locationLabel } from "@/features/workspace/lib/service";
import type { Conversation } from "@/features/workspace/lib/models";
import { SourceLink } from "./views/shared";
import { Markdown } from "@/features/vault/Markdown";
import "./workspace-assistant.css";

function chatTitle(chat: Conversation) {
  const first = chat.messages.find((message) => message.role === "user")?.text.trim();
  if (!first) return "New chat";
  return first.length > 48 ? `${first.slice(0, 47)}…` : first;
}

/** The floating assistant: a chat picker, the messages, and one composer. */
export function AssistantPanel() {
  const {
    data,
    service,
    assistantOpen,
    setAssistantOpen,
    scope,
    setScope,
    selection,
    setSelection,
    queuedPrompt,
    setQueuedPrompt,
    activeDocumentId,
  } = useWorkspace();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [last, setLast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const handled = useRef("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const history = data.chatHistory[data.activeProjectId] ?? [];
  const messages = data.conversation.messages;
  const quote = scope === "selection" && selection?.quote ? selection : undefined;

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
              ? { documentId: selection?.documentId ?? activeDocumentId }
              : undefined,
        );
        // The quote now sits in the sent message; follow-ups stay on the same paper.
        if (scope === "selection" && selection) {
          setSelection({ documentId: selection.documentId });
          setScope("document");
        }
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The assistant could not complete this task.",
        );
      } finally {
        setBusy(false);
      }
    },
    [question, busy, service, scope, selection, activeDocumentId, setSelection, setScope],
  );

  useEffect(() => {
    if (!assistantOpen || busy || !queuedPrompt || handled.current === queuedPrompt.id) return;
    handled.current = queuedPrompt.id;
    setQueuedPrompt(undefined);
    void ask(queuedPrompt.text);
  }, [assistantOpen, queuedPrompt, busy, ask, setQueuedPrompt]);

  // A new quoted passage is ready to ask about.
  useEffect(() => {
    if (assistantOpen && quote) inputRef.current?.focus();
  }, [assistantOpen, quote]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, busy]);

  function clearQuote() {
    setSelection(undefined);
    setScope("project");
  }

  async function switchChat(id?: string) {
    setMenuOpen(false);
    setError("");
    clearQuote();
    await (id ? service.openChat(id) : service.newChat());
    inputRef.current?.focus();
  }

  if (!assistantOpen) return null;
  return (
    <section className="assistant" aria-label="Research assistant">
      <header className="assistant-header">
        <div className="assistant-picker">
          <button
            type="button"
            className="assistant-picker-button"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span>{messages.length ? chatTitle(data.conversation) : "Select chat"}</span>
            <ChevronDown size={14} aria-hidden />
          </button>
          {menuOpen && (
            <div className="assistant-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => void switchChat()}>
                <Plus size={14} aria-hidden /> New chat
              </button>
              {history.length > 0 && <hr />}
              {history.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  role="menuitem"
                  onClick={() => void switchChat(chat.id)}
                >
                  {chatTitle(chat)}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          className="icon-button assistant-close"
          title="Close"
          aria-label="Close research assistant"
          onClick={() => setAssistantOpen(false)}
        >
          <X size={16} />
        </button>
      </header>

      <div className="assistant-messages" ref={listRef} aria-live="polite">
        {!messages.length && !busy && (
          <p className="assistant-empty">Ask anything about your research.</p>
        )}
        {messages.map((message) =>
          message.role === "user" ? (
            <div key={message.id} className="assistant-user">
              {message.scope === "selection" && message.location?.quote && (
                <blockquote>{message.location.quote}</blockquote>
              )}
              <p>{message.text}</p>
            </div>
          ) : (
            <div key={message.id} className="assistant-reply">
              <Markdown source={message.text} />
              {message.citations?.length ? (
                <div className="assistant-citations">
                  {message.citations.map((location, index) => (
                    <SourceLink key={index} location={location} />
                  ))}
                </div>
              ) : null}
            </div>
          ),
        )}
        {busy && (
          <p className="assistant-thinking" role="status">
            Thinking…
          </p>
        )}
        {error && (
          <div className="assistant-error" role="alert">
            {error}
            <button type="button" onClick={() => void ask(last)}>
              <RefreshCcw size={13} /> Retry
            </button>
          </div>
        )}
      </div>

      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        {quote && (
          <div className="assistant-quote">
            <blockquote>{quote.quote}</blockquote>
            <span>
              {locationLabel(
                data.documents.find((item) => item.id === quote.documentId),
                quote,
              )}
            </span>
            <button type="button" aria-label="Remove quote" onClick={clearQuote}>
              <X size={13} />
            </button>
          </div>
        )}
        <div className="assistant-input">
          <label className="sr-only" htmlFor="assistant-question">
            Ask a question
          </label>
          <textarea
            id="assistant-question"
            ref={inputRef}
            rows={1}
            placeholder={quote ? "Ask about this passage…" : "Ask about your research…"}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void ask();
              }
            }}
          />
          <button
            type="submit"
            className="assistant-send"
            disabled={busy || !question.trim()}
            aria-label="Send question"
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </form>
    </section>
  );
}
