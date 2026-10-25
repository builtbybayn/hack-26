"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, FileText, Plus, Quote, Sparkles, X } from "lucide-react";
import { requestChatReply } from "@/lib/api/chat-client";
import type { DocumentRecord } from "@/lib/browser-store";
import type { ChatPaperContext, ChatTurn } from "@/types/chat";
import type { ChatMessage, ChatPassage, VaultChat } from "@/types/vault";
import { Markdown } from "./Markdown";
import { newId, paperName } from "./vault-tree";
import "./chat.css";

interface ChatViewProps {
  chat: VaultChat;
  records: Map<string, DocumentRecord>;
  /** A quoted passage waiting in the composer (set by "Ask AI" in a paper). */
  passage: ChatPassage | null;
  onPassageChange: (passage: ChatPassage | null) => void;
  onChange: (patch: Partial<VaultChat>) => void;
  onOpenPage: (documentId: string, pageNumber: number) => void;
  /** For the narrow extension panel: no header, hint, or large empty state. */
  compact?: boolean;
  /** Extra controls beside the attached papers (e.g. the panel's "Use this page"). */
  contextActions?: ReactNode;
}

const SUGGESTIONS = [
  "Summarize this paper in plain language.",
  "What should I understand before reading this?",
  "What are the main claims, and what evidence supports them?",
  "What are the limitations the authors acknowledge?",
];

/** A conversation with the research assistant about the attached papers. */
export function ChatView({
  chat,
  records,
  passage,
  onPassageChange,
  onChange,
  onOpenPage,
  compact = false,
  contextActions,
}: ChatViewProps) {
  const [text, setText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [adding, setAdding] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (passage) inputRef.current?.focus();
  }, [passage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [chat.messages.length, waiting]);

  useEffect(() => {
    const element = inputRef.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 240)}px`;
  }, [text]);

  const papers = chat.documentIds.flatMap((id) => {
    const record = records.get(id);
    return record ? [record] : [];
  });
  const titleOf = (documentId: string) => {
    const record = records.get(documentId);
    return record ? paperName(record) : "Removed paper";
  };

  const send = async (
    content: string,
    previous: ChatMessage[] = chat.messages,
    quoted: ChatPassage | null = passage,
  ) => {
    const message = content.trim();
    if (!message || waiting) return;
    const userMessage: ChatMessage = {
      id: newId(),
      role: "user",
      content: message,
      ...(quoted ? { passage: quoted } : {}),
      createdAt: new Date().toISOString(),
    };
    // Quoting a paper that isn't attached attaches it.
    const documentIds =
      quoted && !chat.documentIds.includes(quoted.documentId)
        ? [...chat.documentIds, quoted.documentId]
        : chat.documentIds;
    const messages = [...previous, userMessage];
    onChange({ messages, documentIds });
    setText("");
    onPassageChange(null);
    setWaiting(true);

    const turns: ChatTurn[] = messages
      .filter((entry) => !entry.failed)
      .map((entry) => ({
        role: entry.role,
        content: entry.content,
        ...(entry.passage
          ? {
              passage: {
                title: titleOf(entry.passage.documentId),
                pageNumber: entry.passage.pageNumber,
                text: entry.passage.text,
              },
            }
          : {}),
      }));
    const context: ChatPaperContext[] = documentIds.flatMap((id) => {
      const record = records.get(id);
      if (!record) return [];
      return [
        {
          title: paperName(record),
          subject: record.analysis?.understanding.subject,
          topics: record.analysis?.understanding.topics,
          pages: record.document.pages.map(({ pageNumber, text: pageText }) => ({
            pageNumber,
            text: pageText,
          })),
        },
      ];
    });

    const result = await requestChatReply({ messages: turns, papers: context });
    setWaiting(false);
    onChange({
      messages: [
        ...messages,
        {
          id: newId(),
          role: "assistant",
          content: result.ok ? result.data.reply : result.error.message,
          createdAt: new Date().toISOString(),
          ...(result.ok ? {} : { failed: true }),
        },
      ],
    });
  };

  const retry = () => {
    const lastUser = [...chat.messages].reverse().find((message) => message.role === "user");
    if (!lastUser) return;
    // Drop the failed reply and the question, then ask again.
    const index = chat.messages.lastIndexOf(lastUser);
    void send(lastUser.content, chat.messages.slice(0, index), lastUser.passage ?? null);
  };

  const available = [...records.values()].filter((record) => !chat.documentIds.includes(record.id));

  return (
    <div className="chat-view">
      {!compact && (
        <header className="view-header">
          <span className="view-header-title">{chat.name}</span>
        </header>
      )}
      <div className="chat-context" aria-label="Papers in this conversation">
        {papers.map((record) => (
          <span key={record.id} className="context-chip">
            <FileText size={14} />
            <span className="context-chip-name">{paperName(record)}</span>
            <button
              type="button"
              className="clickable-icon"
              aria-label={`Remove ${paperName(record)} from this chat`}
              onClick={() =>
                onChange({ documentIds: chat.documentIds.filter((id) => id !== record.id) })
              }
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {available.length > 0 &&
          (adding ? (
            <select
              autoFocus
              className="dropdown"
              aria-label="Add a paper to this chat"
              defaultValue=""
              onBlur={() => setAdding(false)}
              onChange={(event) => {
                if (event.target.value)
                  onChange({ documentIds: [...chat.documentIds, event.target.value] });
                setAdding(false);
              }}
            >
              <option value="" disabled>
                Choose a paper…
              </option>
              {available.map((record) => (
                <option key={record.id} value={record.id}>
                  {paperName(record)}
                </option>
              ))}
            </select>
          ) : (
            <button type="button" className="context-add" onClick={() => setAdding(true)}>
              <Plus size={14} /> Add paper
            </button>
          ))}
        {contextActions}
        {!papers.length && !available.length && !contextActions && (
          <span className="chat-context-empty">Import a paper to ask about it.</span>
        )}
      </div>

      <div className="chat-scroll">
        <div className="chat-sizer">
          {chat.messages.length === 0 && (
            <div className="chat-empty">
              {!compact && (
                <>
                  <Sparkles size={28} aria-hidden />
                  <h2>Ask about your research</h2>
                  <p>
                    Answers come from the attached papers, with page references. Select text in a
                    paper and choose <strong>Ask AI</strong> to ask about a specific passage.
                  </p>
                </>
              )}
              {papers.length > 0 && (
                <div className="chat-suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => void send(suggestion)}>
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {chat.messages.map((message) => (
            <article
              key={message.id}
              className={
                message.failed
                  ? "chat-message is-assistant is-failed"
                  : `chat-message is-${message.role}`
              }
            >
              {message.passage && (
                <button
                  type="button"
                  className="chat-passage"
                  title="Show in the paper"
                  onClick={() =>
                    onOpenPage(message.passage!.documentId, message.passage!.pageNumber)
                  }
                >
                  <Quote size={14} aria-hidden />
                  <span>{message.passage.text}</span>
                  <small>
                    {titleOf(message.passage.documentId)}, p. {message.passage.pageNumber}
                  </small>
                </button>
              )}
              {message.role === "assistant" && !message.failed ? (
                <div className="markdown-rendered">
                  <Markdown source={message.content} />
                </div>
              ) : (
                <p className="chat-text">{message.content}</p>
              )}
              {message.failed && message === chat.messages.at(-1) && (
                <button type="button" className="mod-muted" onClick={retry}>
                  Try again
                </button>
              )}
            </article>
          ))}
          {waiting && (
            <article className="chat-message is-assistant is-waiting" aria-live="polite">
              <span className="typing" aria-label="Thinking">
                <span />
                <span />
                <span />
              </span>
            </article>
          )}
          <div ref={endRef} />
        </div>
      </div>

      <form
        className="chat-composer"
        onSubmit={(event) => {
          event.preventDefault();
          void send(text);
        }}
      >
        <div className="chat-sizer">
          <div className="composer-box">
            {passage && (
              <div className="composer-passage">
                <Quote size={14} aria-hidden />
                <span>{passage.text}</span>
                <button
                  type="button"
                  className="clickable-icon"
                  aria-label="Remove quoted passage"
                  onClick={() => onPassageChange(null)}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            <textarea
              ref={inputRef}
              rows={1}
              aria-label="Message"
              placeholder={passage ? "Ask about this passage…" : "Ask anything about your papers…"}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send(text);
                }
              }}
            />
            <button
              type="submit"
              className="composer-send"
              aria-label="Send"
              disabled={!text.trim() || waiting}
            >
              <ArrowUp size={16} />
            </button>
          </div>
          {!compact && (
            <p className="composer-hint">
              Enter to send · Shift+Enter for a new line · AI can be wrong; check the cited pages.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
