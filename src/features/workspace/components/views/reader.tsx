"use client";
/**
 * The document reader. Papers (PDFs and saved pages) open in the annotatable paper reader
 * (src/features/paper-reader): select text to highlight it, comment in the margin, or ask the
 * assistant about it. Links without a saved file show their original instead.
 */
import { useId, useState } from "react";
import Link from "next/link";
import { Check, Headphones, PanelRightClose, PanelRightOpen, Quote, X } from "lucide-react";
import { copyText, toBibtex } from "@/features/workspace/lib/bibtex";
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
}: { documentId?: string; passageId?: string } = {}) {
  const { data, service, activeDocumentId, setSelection, setScope, setAssistantOpen, setNotice } =
    useWorkspace();
  const fieldId = useId();
  const settings = useSettings();
  const [sideOpen, setSideOpen] = useState(false);
  const [listenOpen, setListenOpen] = useState(false);
  const [cited, setCited] = useState(false);
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
                <>
                  <button
                    type="button"
                    className="reader-listen-button"
                    aria-pressed={listenOpen}
                    aria-controls={`${fieldId}-listen`}
                    disabled={!record}
                    title="Read this paper aloud"
                    onClick={() => setListenOpen(!listenOpen)}
                  >
                    <Headphones size={16} aria-hidden />
                    <span>{listenOpen ? "Listening" : "Read aloud"}</span>
                  </button>
                  <button
                    type="button"
                    className="reader-cite-button"
                    title="Copy a BibTeX citation"
                    onClick={() =>
                      void copyText(toBibtex(doc))
                        .then(() => {
                          setCited(true);
                          setNotice("BibTeX citation copied.");
                          setTimeout(() => setCited(false), 2000);
                        })
                        .catch((error: Error) => setNotice(error.message))
                    }
                  >
                    {cited ? <Check size={15} aria-hidden /> : <Quote size={15} aria-hidden />}
                    <span>{cited ? "Copied" : "Cite"}</span>
                  </button>
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
                </>
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
                // Each "Ask AI" starts a fresh chat; earlier ones stay under "Select chat".
                if (data.conversation.messages.length) void service.newChat();
              }}
            />
          )}
        </div>

        {listenOpen && record && (
          <aside
            id={`${fieldId}-listen`}
            className="reader-listen theme-obsidian"
            data-theme="dark"
            aria-label="Read aloud"
          >
            <header className="reader-context-heading">
              <h2>Read aloud</h2>
              <button
                className="icon-button"
                aria-label="Close read aloud"
                onClick={() => setListenOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <ReadAloudPanel
              document={record.document}
              onOpenPage={(pageNumber) =>
                setFocus({ documentId: doc.id, pageNumber, nonce: Date.now() })
              }
            />
          </aside>
        )}

        {sideOpen && (
          <aside
            id={`${fieldId}-context`}
            className="reader-context space-y-5"
            aria-label="Document context"
          >
            <header className="reader-context-heading">
              <h2>Info</h2>
              <button
                className="icon-button"
                aria-label="Close document context"
                onClick={() => setSideOpen(false)}
              >
                <PanelRightClose size={18} />
              </button>
            </header>
            <dl className="reader-props">
              {doc.authors.length > 0 && (
                <>
                  <dt>Authors</dt>
                  <dd>{doc.authors.join(", ")}</dd>
                </>
              )}
              {doc.venue && (
                <>
                  <dt>Venue</dt>
                  <dd>{doc.venue}</dd>
                </>
              )}
              <dt>
                <label htmlFor={`${fieldId}-reading`}>Status</label>
              </dt>
              <dd>
                <select
                  id={`${fieldId}-reading`}
                  value={doc.reading}
                  onChange={(event) =>
                    void service.updateDocument(doc.id, {
                      reading: event.target.value as Document["reading"],
                    })
                  }
                >
                  <option value="unread">Unread</option>
                  <option value="reading">Reading</option>
                  <option value="read">Read</option>
                </select>
              </dd>
              {doc.summary && (
                <>
                  <dt>Size</dt>
                  <dd>{doc.summary}</dd>
                </>
              )}
              <dt>
                <label htmlFor={`${fieldId}-source-tag`}>Tags</label>
              </dt>
              <dd className="reader-tags">
                {doc.tags.map((tag) => (
                  <button
                    key={tag}
                    className="tag"
                    title={`Remove ${tag}`}
                    onClick={() =>
                      void service.updateDocument(doc.id, {
                        tags: doc.tags.filter((item) => item !== tag),
                      })
                    }
                  >
                    {tag}
                  </button>
                ))}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const value = tagText.trim();
                    if (value && !doc.tags.includes(value))
                      void service.updateDocument(doc.id, { tags: [...doc.tags, value] });
                    setTagText("");
                  }}
                >
                  <input
                    id={`${fieldId}-source-tag`}
                    placeholder="Add…"
                    value={tagText}
                    onChange={(event) => setTagText(event.target.value)}
                  />
                </form>
              </dd>
            </dl>

            {gaps.length > 0 && (
              <section className="reader-section">
                <h3>Know before reading</h3>
                <p>
                  {gaps
                    .slice(0, 3)
                    .map((item) => item.name)
                    .join(", ")}
                </p>
                <Link href="/roadmap" className="reader-section-link">
                  Open roadmap
                </Link>
              </section>
            )}

            <section className="reader-section">
              <h3>Highlights{annotations.length > 0 && <span>{annotations.length}</span>}</h3>
              {annotations.length ? (
                annotations.map((item) => (
                  <button
                    key={item.id}
                    className="reader-annotation"
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
                    <span>
                      {item.kind === "note" ? "Comment" : "Highlight"} · p.{" "}
                      {item.location.page || "?"}
                    </span>
                    {item.text}
                  </button>
                ))
              ) : (
                <p className="reader-empty">Select text in the paper to highlight it.</p>
              )}
            </section>

            {relatedNotes.length > 0 && (
              <section className="reader-section">
                <h3>Notes</h3>
                {relatedNotes.map((item) => (
                  <p key={item.id} className="reader-note">
                    {item.title}
                  </p>
                ))}
              </section>
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
          </aside>
        )}
      </div>
    </div>
  );
}
