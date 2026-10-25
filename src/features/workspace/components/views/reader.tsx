"use client";
/**
 * The document reader. Papers (PDFs and saved pages) open in the annotatable paper reader
 * (src/features/paper-reader): select text to highlight it, comment in the margin, or ask the
 * assistant about it. Links without a saved file show their original instead.
 */
import { useId, useState } from "react";
import Link from "next/link";
import { BookOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { PaperView, type PaperFocus } from "@/features/paper-reader/PaperView";
import { useSettings } from "@/features/vault/use-settings";
import { usePaperRecord } from "@/features/workspace/lib/use-paper-record";
import { ReadAloudPanel } from "@/features/voice/ReadAloudPanel";
import { RecommendationsPanel } from "@/features/recommendations/RecommendationsPanel";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";
import type { Document } from "@/features/workspace/lib/models";
import { Empty, PageHeading } from "./shared";
import "@/components/theme/obsidian-theme.css";
import "./reader.css";

export function ReaderView({
  documentId,
  passageId,
  onOpenDocument,
}: { documentId?: string; passageId?: string; onOpenDocument?: (id: string) => void } = {}) {
  const {
    data,
    service,
    activeDocumentId,
    setActiveDocumentId,
    setSelection,
    setScope,
    setAssistantOpen,
  } = useWorkspace();
  const fieldId = useId();
  const settings = useSettings();
  const [sideOpen, setSideOpen] = useState(false);
  const [tagText, setTagText] = useState("");

  const documents = data.documents.filter(
    (item) => item.projectId === data.activeProjectId && item.status === "ready",
  );
  const doc = documentId
    ? documents.find((item) => item.id === documentId)
    : documents.find((item) => item.id === activeDocumentId) || documents[0];
  const record = usePaperRecord(doc && doc.kind !== "link" ? doc.id : null, data.documents);

  // ?passage=p12 (from links, the extension, and search) opens the paper at page 12.
  const [focus, setFocus] = useState<PaperFocus | null>(null);
  const requestedPage = Number(passageId?.match(/^p(\d+)$/)?.[1]);
  const focusKey = doc && requestedPage ? `${doc.id}:${requestedPage}` : "";
  const [shownFocus, setShownFocus] = useState("");
  if (focusKey && focusKey !== shownFocus && doc) {
    setShownFocus(focusKey);
    setFocus({ documentId: doc.id, pageNumber: requestedPage, nonce: `${fieldId}:${focusKey}` });
  }

  const annotations = data.annotations.filter((item) => item.location.documentId === doc?.id);
  const relatedNotes = data.notes.filter(
    (item) => item.projectId === data.activeProjectId && item.location?.documentId === doc?.id,
  );
  const gaps = data.concepts.filter(
    (item) =>
      item.projectId === data.activeProjectId &&
      item.location.documentId === doc?.id &&
      item.status !== "understood",
  );

  if (!doc)
    return (
      <>
        <PageHeading
          eyebrow="DOCUMENT READER"
          title={documentId ? "Source unavailable" : "Start with a source."}
          description="Add a document, then read and annotate it here."
        />
        <Empty
          title="No ready documents"
          detail="Add a source in the library to start reading."
          action={
            <Link className="btn btn-primary" href="/library">
              Open library
            </Link>
          }
        />
      </>
    );

  return (
    <div className="reader-workspace">
      {doc.kind === "link" && (
        <header className="reader-link-toolbar">
          <span>{doc.title}</span>
          <button className="btn" onClick={() => setSideOpen(!sideOpen)}>
            {sideOpen ? "Hide context" : "Show context"}
          </button>
        </header>
      )}
      <div className="reader-layout">
        <div className="reader-surface theme-obsidian" data-theme="dark">
          {doc.demo ? (
            <article className="demo-source-reader">
              <header>
                <p className="eyebrow">FICTIONAL DEMONSTRATION SOURCE</p>
                <h1>{doc.title}</h1>
                <button className="btn" onClick={() => setSideOpen(!sideOpen)}>
                  {sideOpen ? "Hide context" : "Show context"}
                </button>
              </header>
              {doc.passages.map((passage) => (
                <section key={passage.id} id={passage.id}>
                  <h2>{passage.heading || `Page ${passage.page || 1}`}</h2>
                  <p>{passage.text}</p>
                </section>
              ))}
            </article>
          ) : doc.kind === "link" ? (
            <Empty
              title="Saved link"
              detail={doc.summary}
              action={
                doc.url ? (
                  <a className="btn btn-primary" href={doc.url} target="_blank" rel="noreferrer">
                    Open original
                  </a>
                ) : undefined
              }
            />
          ) : (
            <PaperView
              key={doc.id}
              documentId={doc.id}
              title={doc.title}
              record={record}
              author={settings.authorName}
              focus={focus}
              toolbarActions={
                <button
                  type="button"
                  className="clickable-icon"
                  aria-label={sideOpen ? "Hide document context" : "Show document context"}
                  aria-expanded={sideOpen}
                  aria-controls={`${fieldId}-context`}
                  title={sideOpen ? "Hide document context" : "Show document context"}
                  onClick={() => setSideOpen(!sideOpen)}
                >
                  {sideOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
                </button>
              }
              onAskAi={(passage) => {
                setSelection({
                  documentId: passage.documentId,
                  page: passage.pageNumber,
                  passageId: `p${passage.pageNumber}`,
                  quote: passage.text,
                });
                setScope("selection");
                setAssistantOpen(true);
              }}
            />
          )}
        </div>

        {sideOpen && (
          <aside
            id={`${fieldId}-context`}
            className="reader-context space-y-5"
            aria-label="Document context"
          >
            <header className="reader-context-heading">
              <h2>Document context</h2>
              <button
                className="icon-button"
                aria-label="Close document context"
                onClick={() => setSideOpen(false)}
              >
                <PanelRightClose size={18} />
              </button>
            </header>
            <div className="space-y-3">
              <label className="block text-xs text-muted" htmlFor={`${fieldId}-reader-doc`}>
                Source
              </label>
              <select
                id={`${fieldId}-reader-doc`}
                className="input text-xs"
                value={doc.id}
                onChange={(event) => {
                  if (onOpenDocument) onOpenDocument(event.target.value);
                  else setActiveDocumentId(event.target.value);
                }}
              >
                {documents.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted">
                {doc.authors.join(", ") || "Author metadata missing"}
                {doc.venue ? ` · ${doc.venue}` : ""}
              </p>
              <label className="block text-xs text-muted" htmlFor={`${fieldId}-reading`}>
                Reading status
              </label>
              <select
                id={`${fieldId}-reading`}
                className="input text-xs"
                value={doc.reading}
                onChange={(event) =>
                  void service.updateDocument(doc.id, {
                    reading: event.target.value as Document["reading"],
                  })
                }
              >
                <option value="unread">Unread</option>
                <option value="reading">In progress</option>
                <option value="read">Read</option>
              </select>
            </div>
            {record && (
              <details
                className="research-details workspace-research-tools theme-obsidian"
                data-theme="dark"
              >
                <summary>Read aloud</summary>
                <ReadAloudPanel
                  document={record.document}
                  onOpenPage={(pageNumber) =>
                    setFocus({ documentId: doc.id, pageNumber, nonce: Date.now() })
                  }
                />
              </details>
            )}
            {record?.analysis && (
              <details
                className="research-details workspace-research-tools theme-obsidian"
                data-theme="dark"
              >
                <summary>Related papers</summary>
                <RecommendationsPanel
                  key={record.updatedAt}
                  document={record.document}
                  analysis={record.analysis}
                  initialResult={record.recommendations ?? null}
                  onSavePaper={async (paper) => {
                    await service.addLink(paper.openAccessPdfUrl || paper.url, paper.title);
                  }}
                />
              </details>
            )}
            <section className="surface rounded-xl p-4">
              <p className="eyebrow">SOURCE DETAILS</p>
              <p className="mt-3 text-xs leading-relaxed text-muted">{doc.summary}</p>
              <p className="mt-3 text-xs">Tags</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {doc.tags.map((tag) => (
                  <button
                    key={tag}
                    className="tag hover:border-neutral"
                    title={`Remove ${tag} tag`}
                    onClick={() =>
                      void service.updateDocument(doc.id, {
                        tags: doc.tags.filter((item) => item !== tag),
                      })
                    }
                  >
                    {tag} ×
                  </button>
                ))}
              </div>
              <form
                className="mt-3 flex gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = tagText.trim();
                  if (value && !doc.tags.includes(value))
                    void service.updateDocument(doc.id, { tags: [...doc.tags, value] });
                  setTagText("");
                }}
              >
                <label className="sr-only" htmlFor={`${fieldId}-source-tag`}>
                  Add tag
                </label>
                <input
                  id={`${fieldId}-source-tag`}
                  className="input min-w-0 flex-1 text-xs"
                  placeholder="Add tag"
                  value={tagText}
                  onChange={(event) => setTagText(event.target.value)}
                />
                <button className="btn px-2 text-xs" type="submit">
                  Add
                </button>
              </form>
            </section>
            <section className="surface rounded-xl p-4">
              <p className="eyebrow">HIGHLIGHTS & COMMENTS</p>
              {annotations.length ? (
                <div className="mt-4 space-y-3">
                  {annotations.map((item) => (
                    <button
                      key={item.id}
                      className="block w-full border-l-2 border-neutral pl-3 text-left"
                      onClick={() =>
                        item.location.page &&
                        setFocus({
                          documentId: doc.id,
                          pageNumber: item.location.page,
                          annotationId: item.id,
                          nonce: Date.now(),
                        })
                      }
                    >
                      <span className="text-[10px] text-neutral uppercase">
                        {item.kind === "note" ? "comment" : "highlight"} · p.{" "}
                        {item.location.page || "?"}
                      </span>
                      <p className="mt-1 text-xs leading-relaxed">{item.text}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-xs leading-relaxed text-muted">
                  Select text in the paper to highlight it, comment, or ask the assistant.
                </p>
              )}
            </section>
            <section className="surface rounded-xl p-4">
              <p className="eyebrow">RELATED NOTES</p>
              {relatedNotes.length ? (
                relatedNotes.map((item) => (
                  <div key={item.id} className="mt-3 border-b border-line pb-2 text-xs">
                    <p className="font-semibold">{item.title}</p>
                    <p className="mt-1 text-muted">{item.body}</p>
                  </div>
                ))
              ) : (
                <p className="mt-3 text-xs text-muted">No linked notes yet.</p>
              )}
            </section>
            {gaps.length > 0 && (
              <section className="rounded-xl border border-[#363636] bg-[#1e1e1e] p-4">
                <p className="eyebrow">KNOW BEFORE READING</p>
                <p className="mt-2 text-sm">
                  {gaps
                    .slice(0, 3)
                    .map((item) => item.name)
                    .join(", ")}
                </p>
                <p className="mt-1 text-xs text-muted">Needed to read this source confidently.</p>
                <Link
                  href="/roadmap"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-neutral"
                >
                  <BookOpen size={13} /> Open roadmap
                </Link>
              </section>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
