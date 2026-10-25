"use client";
import Link from "next/link";
import { ArrowRight, Link2, Plus, Search, Upload, X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import type { Document } from "@/features/workspace/lib/models";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";
import { Empty, PageHeading, SectionTitle, SourceLink, Status } from "./shared";
import { ResearchProjects } from "@/features/projects/ResearchProjects";
import { usePaperRecord } from "@/features/workspace/lib/use-paper-record";
import { SavedChats } from "../saved-chats";
import "@/components/theme/obsidian-theme.css";
import "@xyflow/react/dist/style.css";

export function Overview() {
  const { data, activeDocumentId, setActiveDocumentId } = useWorkspace();
  const docs = data.documents.filter((doc) => doc.projectId === data.activeProjectId);
  const currentDocument =
    docs.find((doc) => doc.id === activeDocumentId) ||
    docs.find((doc) => doc.kind !== "link" && doc.status === "ready");
  const record = usePaperRecord(currentDocument?.id ?? null, data.documents);
  const next = data.concepts.find(
    (item) => item.projectId === data.activeProjectId && item.status !== "understood",
  );
  const findings = data.findings.filter(
    (item) => item.projectId === data.activeProjectId && item.review === "needs-review",
  );
  const questions = data.notes.filter(
    (item) => item.projectId === data.activeProjectId && item.question && !item.resolved,
  );
  const project = data.projects.find((item) => item.id === data.activeProjectId);
  const concepts = data.concepts.filter((item) => item.projectId === data.activeProjectId);
  const notes = data.notes.filter((item) => item.projectId === data.activeProjectId);
  const understood = concepts.filter((item) => item.status === "understood").length;
  const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;
  return (
    <>
      <PageHeading
        eyebrow="PROJECT OVERVIEW"
        title={project?.name || "Project overview"}
        description={project?.description || ""}
        action={
          <Link className="btn btn-primary" href="/library">
            <Plus size={15} /> Add source
          </Link>
        }
      />
      <nav className="project-stats" aria-label="Project at a glance">
        <Link href="/library">{plural(docs.length, "source")}</Link>
        <Link href="/notes">{plural(notes.length, "note")}</Link>
        <Link href="/roadmap" title={next ? `Next: ${next.name}` : undefined}>
          {concepts.length ? `${understood}/${concepts.length} concepts` : "Roadmap"}
        </Link>
        <Link href="/evidence">
          {findings.length ? plural(findings.length, "finding") + " to review" : "Evidence"}
        </Link>
      </nav>
      <section>
        <SectionTitle title="Recent sources" href={docs.length > 4 ? "/library" : undefined} />
        {docs.length ? (
          docs
            .slice()
            .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
            .slice(0, 4)
            .map((doc) => (
              <Link
                key={doc.id}
                href={`/reader?doc=${doc.id}`}
                onClick={() => setActiveDocumentId(doc.id)}
                className="recent-source"
              >
                <span>
                  {doc.title}
                  {doc.authors.length > 0 && <small>{doc.authors.join(", ")}</small>}
                </span>
                <ArrowRight size={15} />
              </Link>
            ))
        ) : (
          <Empty title="No sources yet" detail="Add a paper to begin." />
        )}
      </section>
      {questions.length > 0 && (
        <details className="research-details" open>
          <summary>Open questions · {questions.length}</summary>
          {questions.map((note) => (
            <article key={note.id} className="py-3">
              <Link href={`/notes?note=${note.id}`}>{note.title}</Link>
              {note.location && (
                <div className="mt-1">
                  <SourceLink location={note.location} />
                </div>
              )}
            </article>
          ))}
        </details>
      )}
      <details
        className="research-details workspace-research-tools theme-obsidian"
        data-theme="dark"
      >
        <summary>Literature collections</summary>
        <ResearchProjects document={record?.document ?? null} analysis={record?.analysis ?? null} />
      </details>
      <details className="research-details">
        <summary>Chats</summary>
        <SavedChats />
      </details>
    </>
  );
}

export function LibraryView() {
  const filterId = useId();
  const { data, service, setNotice, setActiveDocumentId } = useWorkspace();
  const fileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [sort, setSort] = useState("newest");
  const [drag, setDrag] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const kinds = [
    ...new Set(
      data.documents.filter((doc) => doc.projectId === data.activeProjectId).map((doc) => doc.kind),
    ),
  ];
  const docs = useMemo(
    () =>
      data.documents
        .filter(
          (doc) =>
            doc.projectId === data.activeProjectId &&
            (kind === "all" || doc.kind === kind) &&
            [doc.title, doc.summary, ...doc.tags, ...doc.authors]
              .join(" ")
              .toLowerCase()
              .includes(query.toLowerCase()),
        )
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title)
            : sort === "oldest"
              ? a.addedAt.localeCompare(b.addedAt)
              : b.addedAt.localeCompare(a.addedAt),
        ),
    [data, kind, query, sort],
  );
  async function files(list: FileList | null) {
    if (!list?.length) return;
    for (const file of Array.from(list)) {
      try {
        const document = await service.upload(file);
        setNotice(
          document.status === "failed"
            ? document.error || "This file could not be read."
            : `${file.name} saved. Analysis runs in the background.`,
        );
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not add file.");
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }
  async function addLink() {
    try {
      await service.addLink(linkUrl, linkTitle);
      setLinkOpen(false);
      setLinkUrl("");
      setLinkTitle("");
      setNotice(
        "Link saved. Add its PDF or capture the page with the browser extension to read it here.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save link.");
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="RESEARCH LIBRARY"
        title="Library"
        description=""
        action={
          <div className="flex gap-2">
            <button className="btn btn-quiet" onClick={() => setLinkOpen(true)}>
              <Link2 size={15} /> Save link
            </button>
            <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Add source
            </button>
          </div>
        }
      />
      <input
        ref={fileRef}
        type="file"
        className="sr-only"
        accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
        multiple
        onChange={(event) => void files(event.target.files)}
        aria-label="Choose sources to upload"
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[230px] flex-1">
          <Search size={16} className="absolute top-3 left-3 text-muted" />
          <span className="sr-only">Search library</span>
          <input
            className="input input-with-icon"
            placeholder="Search sources…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {kinds.length > 1 && (
          <>
            <label className="sr-only" htmlFor={`${filterId}-kind-filter`}>
              Filter source type
            </label>
            <select
              className="input w-auto"
              id={`${filterId}-kind-filter`}
              value={kind}
              onChange={(event) => setKind(event.target.value)}
            >
              <option value="all">All types</option>
              <option value="pdf">PDFs</option>
              <option value="article">Articles</option>
              <option value="note">Notes</option>
              <option value="link">Links</option>
            </select>
          </>
        )}
        <label className="sr-only" htmlFor={`${filterId}-sort-sources`}>
          Sort sources
        </label>
        <select
          className="input w-auto"
          id={`${filterId}-sort-sources`}
          value={sort}
          onChange={(event) => setSort(event.target.value)}
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="title">Title A–Z</option>
        </select>
      </div>
      <div
        className={`surface overflow-hidden rounded-xl ${drag ? "library-drop" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDrag(false);
          void files(event.dataTransfer.files);
        }}
      >
        {docs.length ? (
          docs.map((doc) => (
            <LibraryRow
              key={doc.id}
              doc={doc}
              onOpen={() => setActiveDocumentId(doc.id)}
              onRetry={() =>
                void service.retryUpload(doc.id).catch((error) => setNotice(error.message))
              }
            />
          ))
        ) : (
          <Empty
            title="No matching materials"
            detail={
              query || kind !== "all"
                ? "Try a different search or filter."
                : "Add your first paper, PDF, text note, or link to begin."
            }
            action={
              <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
                <Plus size={14} /> Add a source
              </button>
            }
          />
        )}
      </div>
      {linkOpen && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Save source link"
        >
          <form
            className="surface w-full max-w-md rounded-xl p-6"
            onSubmit={(event) => {
              event.preventDefault();
              void addLink();
            }}
          >
            <div className="flex justify-between">
              <h2 className="text-xl font-semibold">Save a link</h2>
              <button
                type="button"
                className="btn btn-quiet p-1"
                aria-label="Close"
                onClick={() => setLinkOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <label className="mt-5 block text-xs text-muted">
              URL
              <input
                className="input mt-2"
                type="url"
                required
                placeholder="https://…"
                value={linkUrl}
                onChange={(event) => setLinkUrl(event.target.value)}
              />
            </label>
            <label className="mt-4 block text-xs text-muted">
              Title (optional)
              <input
                className="input mt-2"
                value={linkTitle}
                onChange={(event) => setLinkTitle(event.target.value)}
              />
            </label>
            <button className="btn btn-primary mt-6 w-full" type="submit">
              Save link
            </button>
          </form>
        </div>
      )}
    </>
  );
}
function LibraryRow({
  doc,
  onOpen,
  onRetry,
}: {
  doc: Document;
  onOpen: () => void;
  onRetry: () => void;
}) {
  const busy = doc.status === "processing" || doc.status === "uploading";
  const byline = [doc.authors.join(", "), doc.year].filter(Boolean).join(" · ");
  return (
    <div className="library-row">
      <div className="min-w-0 flex-1">
        <Link href={`/reader?doc=${doc.id}`} onClick={onOpen} className="library-row-title">
          {doc.title}
        </Link>
        {byline && <p className="library-row-meta">{byline}</p>}
        {busy ? (
          <div
            className="library-row-progress"
            role="progressbar"
            aria-valuenow={doc.progress || 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${doc.title} processing`}
          >
            <span style={{ width: `${doc.progress || 0}%` }} />
          </div>
        ) : (
          doc.summary && <p className="library-row-summary">{doc.summary}</p>
        )}
        {doc.error && <p className="library-row-error">{doc.error}</p>}
      </div>
      {(doc.status === "failed" || doc.error) && (
        <button className="btn text-xs" onClick={onRetry}>
          Retry
        </button>
      )}
      {busy && <Status status={doc.status} />}
    </div>
  );
}
