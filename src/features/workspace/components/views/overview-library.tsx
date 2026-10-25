"use client";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  FilePlus2,
  FileText,
  Link2,
  Plus,
  Search,
  Upload,
  X,
} from "lucide-react";
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
      <div className="project-stats">
        <span>
          <strong>{docs.length}</strong> sources
        </span>
        <span>
          <strong>
            {data.notes.filter((item) => item.projectId === data.activeProjectId).length}
          </strong>{" "}
          notes
        </span>
        <span>
          <strong>
            {concepts.filter((item) => item.status === "understood").length}/{concepts.length}
          </strong>{" "}
          concepts understood
        </span>
        <span>
          <strong>{findings.length}</strong> findings to review
        </span>
      </div>
      <div className="mb-8 flex flex-wrap gap-2">
        {docs.length > 0 && (
          <Link
            href={`/reader?doc=${docs.some((item) => item.id === activeDocumentId) ? activeDocumentId : docs[0].id}`}
            className="btn"
          >
            <BookOpen size={15} /> Continue reading
          </Link>
        )}
        <Link href="/writing" className="btn">
          <FileText size={15} /> Open draft
        </Link>
      </div>
      <section>
        <SectionTitle title="Recent sources" href="/library" />
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
                  <small>
                    {doc.kind.toUpperCase()} · {doc.authors.join(", ") || "Metadata pending"}
                  </small>
                </span>
                <ArrowRight size={15} />
              </Link>
            ))
        ) : (
          <Empty title="No sources yet" detail="Add a source to begin your research." />
        )}
      </section>
      <details className="research-details">
        <summary>Questions · {questions.length}</summary>
        {questions.map((note) => (
          <article key={note.id} className="py-4">
            <Link href={`/notes?note=${note.id}`}>{note.title}</Link>
            <p className="mt-2 text-sm text-muted">{note.body}</p>
            {note.location && <SourceLink location={note.location} />}
          </article>
        ))}
      </details>
      <details className="research-details">
        <summary>Research progress</summary>
        <p className="py-4 text-sm">Next: {next?.name || "All current concepts understood"}</p>
        <Link href="/roadmap" className="btn">
          Knowledge roadmap
        </Link>
        <Link href="/evidence" className="btn ml-2">
          Review evidence · {findings.length}
        </Link>
      </details>
      <details
        className="research-details workspace-research-tools theme-obsidian"
        data-theme="dark"
      >
        <summary>Saved literature collections, synthesis & briefs</summary>
        <p className="mt-3 text-sm text-muted">
          Your existing literature collections retain their saved searches, reading lists,
          synthesis, briefs, and gap ideas. Attach the current paper or manage a collection below.
        </p>
        <ResearchProjects document={record?.document ?? null} analysis={record?.analysis ?? null} />
      </details>
      <details className="research-details">
        <summary>Saved extension conversations</summary>
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
  const [tag, setTag] = useState("all");
  const [sort, setSort] = useState("newest");
  const [drag, setDrag] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkTitle, setLinkTitle] = useState("");
  const tags = [
    ...new Set(
      data.documents
        .filter((doc) => doc.projectId === data.activeProjectId)
        .flatMap((doc) => doc.tags),
    ),
  ].sort();
  const docs = useMemo(
    () =>
      data.documents
        .filter(
          (doc) =>
            doc.projectId === data.activeProjectId &&
            (kind === "all" || doc.kind === kind) &&
            (tag === "all" || doc.tags.includes(tag)) &&
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
    [data, kind, tag, query, sort],
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
        title="Research library"
        description=""
        action={
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Add source
          </button>
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
      <details className="research-details mb-5">
        <summary>Add files or save a link</summary>
        <div
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
          className={`mb-7 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-dashed p-5 ${drag ? "border-neutral bg-[#262626]" : "border-[#363636] bg-[#1e1e1e]"}`}
        >
          <div className="flex items-center gap-4">
            <span className="rounded-lg bg-[#262626] p-3 text-neutral">
              <Upload size={22} />
            </span>
            <div>
              <p className="text-sm font-semibold">Drop PDF or text files here</p>
              <p className="mt-1 text-xs text-muted">
                PDF, TXT, or Markdown · 25 MB maximum · saved in this browser
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <FilePlus2 size={15} /> Choose files
            </button>
            <button className="btn" onClick={() => setLinkOpen(true)}>
              <Link2 size={15} /> Save link
            </button>
          </div>
        </div>
      </details>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-[230px] flex-1">
          <Search size={16} className="absolute top-3 left-3 text-muted" />
          <span className="sr-only">Search library</span>
          <input
            className="input pl-9"
            placeholder="Search materials, authors, tags…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
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
        <label className="sr-only" htmlFor={`${filterId}-tag-filter`}>
          Filter tag
        </label>
        <select
          className="input w-auto"
          id={`${filterId}-tag-filter`}
          value={tag}
          onChange={(event) => setTag(event.target.value)}
        >
          <option value="all">All tags</option>
          {tags.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
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
      <div className="surface overflow-hidden rounded-xl">
        <div className="flex justify-between border-b border-line px-5 py-3 text-[11px] font-semibold tracking-widest text-muted uppercase">
          <span>{docs.length} materials</span>
          <span>Project library</span>
        </div>
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
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-line px-5 py-4 last:border-0 hover:bg-[#1e1e1e]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#363636] bg-[#1e1e1e] text-neutral">
        <FileText size={19} />
      </div>
      <div className="min-w-[230px] flex-1">
        <Link
          href={`/reader?doc=${doc.id}`}
          onClick={onOpen}
          className="text-sm font-semibold hover:text-neutral"
        >
          {doc.title}
        </Link>
        <p className="mt-1 text-xs text-muted">
          {doc.authors.join(", ") || "Author metadata missing"}
          {doc.year ? ` · ${doc.year}` : ""} · {doc.kind.toUpperCase()}
          {doc.demo ? " · Fictional demo" : ""}
        </p>
        <p className="mt-2 line-clamp-1 text-xs text-[#999999]">{doc.summary}</p>
        {doc.status === "processing" || doc.status === "uploading" ? (
          <div
            className="mt-2 h-1.5 max-w-xs rounded-full bg-[#363636]"
            role="progressbar"
            aria-valuenow={doc.progress || 0}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${doc.title} processing`}
          >
            <div
              className="h-full rounded-full bg-neutral"
              style={{ width: `${doc.progress || 0}%` }}
            />
          </div>
        ) : null}
        {doc.error && <p className="mt-1 text-xs text-neutral">{doc.error}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Status status={doc.status} />
        {doc.status === "failed" || doc.error ? (
          <button className="btn text-xs" onClick={onRetry}>
            {doc.status === "failed" ? "Retry upload" : "Retry analysis"}
          </button>
        ) : (
          <Link className="btn text-xs" href={`/reader?doc=${doc.id}`} onClick={onOpen}>
            Open <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}
