"use client";

/**
 * The extension side panel, loaded at /panel inside the extension. It follows the active tab:
 * on a PDF it offers "Analyze this paper" and "Open in vault" (at the page you're reading);
 * anywhere else it starts a research project (a roadmap filed in the workspace) or chats.
 * Uses the workspace's liquid blob and visual conventions through scoped panel tokens.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ExternalLink, FilePenLine, FileText, Globe, LoaderCircle, SquarePen } from "lucide-react";
import { AgentSprite } from "@/features/agent/AgentSprite";
import { ChatView } from "@/features/vault/ChatView";
import { CHATS_FOLDER, ensureFolder, newId, uniqueName } from "@/features/vault/vault-tree";
import { parseDocument } from "@/lib/api/intelligence-client";
import {
  listDocumentRecords,
  listVaultEntries,
  putVaultEntries,
  saveDocument,
  subscribeStoreChanges,
  type DocumentRecord,
} from "@/lib/browser-store";
import { runPaperPipeline } from "@/lib/paper-pipeline";
import type { ParsedDocument } from "@/types/ingestion";
import { PIPELINE_STEPS, type PipelineStepStatus } from "@/types/pipeline";
import type { VaultChat } from "@/types/vault";
import {
  pageFromUrl,
  paperForUrl,
  rememberPaperForUrl,
  useExtensionBridge,
  type TabPaper,
} from "./bridge";
import { Conflicts, RelatedPapers } from "./PaperResults";
import { ProjectBuilder } from "./ProjectBuilder";
import "@/components/theme/obsidian-theme.css";
import "./extension-panel.css";

/** What to do with a paper once the tab hands it over. */
type Intent = { kind: "analyze" } | { kind: "open"; page: number } | { kind: "attach" };

const STATUS_TEXT: Record<PipelineStepStatus, string> = {
  pending: "Waiting",
  running: "Working…",
  done: "Done",
  skipped: "Skipped",
  failed: "Failed",
};

function emptyChat(): VaultChat {
  const at = new Date().toISOString();
  return {
    id: newId(),
    kind: "chat",
    name: "Panel chat",
    parentId: null,
    documentIds: [],
    messages: [],
    createdAt: at,
    updatedAt: at,
  };
}

export function ExtensionPanel() {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pageDraft, setPageDraft] = useState<{ url: string; value: string } | null>(null);
  const [chat, setChat] = useState<VaultChat | null>(null);
  /** Bumped by "New chat" to reset the chat view. */
  const [chatGeneration, setChatGeneration] = useState(0);
  /** Off a PDF: start a research project, or ask the assistant. */
  const [mode, setMode] = useState<"project" | "ask">("project");
  const [projectActive, setProjectActive] = useState(false);
  const intent = useRef<Intent>({ kind: "analyze" });
  const pipelineAbort = useRef<AbortController | null>(null);
  const chatRef = useRef<VaultChat | null>(null);
  const filed = useRef(false);
  const writes = useRef(Promise.resolve());

  const reloadRecords = useCallback(
    () =>
      listDocumentRecords()
        .then(setRecords)
        .catch(() => setError("Couldn't open browser storage.")),
    [],
  );

  useEffect(() => {
    void reloadRecords();
    // The vault (another tab) may analyze or delete papers too.
    const unsubscribe = subscribeStoreChanges((change) => {
      if (change === "documents") void reloadRecords();
    });
    return () => {
      unsubscribe();
      pipelineAbort.current?.abort();
    };
  }, [reloadRecords]);

  const bridge = useExtensionBridge({
    onPaper: (paper) => void receivePaper(paper),
    onSelection: () => {},
    onError: (_request, message) => {
      setBusy(null);
      setError(message);
    },
  });

  const tab = bridge.tab;
  const onPdf = tab?.kind === "pdf";
  const tabPaperId = tab ? paperForUrl(tab.url) : null;
  const record = records.find((entry) => entry.id === tabPaperId) ?? null;
  const running = Boolean(record && runningId === record.id);
  const pageCount = record?.document.metadata.pageCount ?? record?.document.pages.length ?? null;
  const pageValue =
    pageDraft && tab && pageDraft.url === tab.url
      ? pageDraft.value
      : String((tab && pageFromUrl(tab.url)) ?? 1);
  const page = Math.max(1, Math.min(Number(pageValue) || 1, pageCount ?? Infinity));

  const upsert = (updated: DocumentRecord) =>
    setRecords((current) => [updated, ...current.filter((entry) => entry.id !== updated.id)]);

  async function runPipeline(
    document: ParsedDocument,
    file: { blob: Blob; fileName: string } | undefined,
    onSaved?: () => void,
  ) {
    pipelineAbort.current?.abort();
    const controller = new AbortController();
    pipelineAbort.current = controller;
    setRunningId(document.id);
    let announced = false;
    try {
      await runPaperPipeline(document, {
        file,
        signal: controller.signal,
        onUpdate: (updated) => {
          upsert(updated);
          if (!announced && updated.pipeline?.saved.status === "done") {
            announced = true;
            onSaved?.();
          }
        },
      });
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError"))
        setError(caught instanceof Error ? caught.message : "The analysis stopped unexpectedly.");
    } finally {
      setRunningId((current) => (current === document.id ? null : current));
    }
  }

  /** The tab's paper arrived: parse it, then analyze, open in the vault, or attach to the chat. */
  async function receivePaper(paper: TabPaper) {
    setBusy("Reading the paper…");
    const file =
      paper.kind === "pdf"
        ? new File([paper.bytes], paper.fileName, { type: "application/pdf" })
        : // Page text becomes Markdown titled with the tab's title, so the paper has a title.
          new File(
            [paper.title ? `# ${paper.title}\n\n${paper.text}` : paper.text],
            paper.fileName,
            { type: "text/markdown" },
          );
    const parsed = await parseDocument(file, { mode: "standard" });
    setBusy(null);
    if (!parsed.ok) {
      setError(parsed.error.message);
      return;
    }
    const { document } = parsed.data;
    rememberPaperForUrl(paper.url, document.id);
    const wanted = intent.current;
    if (wanted.kind === "attach") {
      await saveDocument(document);
      await reloadRecords();
      const current = chatRef.current ?? emptyChat();
      updateChat({ documentIds: [...new Set([...current.documentIds, document.id])] });
      return;
    }
    await runPipeline(
      document,
      { blob: file, fileName: file.name },
      wanted.kind === "open" ? () => bridge.openApp(document.id, wanted.page) : undefined,
    );
  }

  const request = (next: Intent) => {
    setError(null);
    intent.current = next;
    bridge.requestPaper();
  };

  /** Opens the paper in the vault at the chosen page, saving (and analyzing) it first if needed. */
  const openInVault = () => {
    if (record) bridge.openApp(record.id, page);
    else request({ kind: "open", page });
  };

  /** Applies a change and saves the chat to the vault's "Chats" folder (filed on first save). */
  function updateChat(patch: Partial<VaultChat>) {
    const next = {
      ...(chatRef.current ?? emptyChat()),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    chatRef.current = next;
    setChat(next);
    if (!next.messages.length) return;
    writes.current = writes.current
      .then(async () => {
        const latest = chatRef.current!;
        if (filed.current) {
          await putVaultEntries([latest]);
          return;
        }
        const entries = await listVaultEntries();
        const { folderId, created } = ensureFolder(entries, null, CHATS_FOLDER);
        const question = latest.messages[0]?.content.replace(/\s+/g, " ").trim() ?? "";
        const filedChat = {
          ...latest,
          parentId: folderId,
          name: uniqueName(
            [...entries, ...created],
            folderId,
            question ? `Chat – ${question.slice(0, 40)}` : "Panel chat",
          ),
        };
        chatRef.current = {
          ...chatRef.current!,
          parentId: filedChat.parentId,
          name: filedChat.name,
        };
        filed.current = true;
        setChat(chatRef.current);
        await putVaultEntries([...created, chatRef.current]);
      })
      .catch(() => setError("Couldn't save this chat to your vault."));
  }

  const newChat = () => {
    chatRef.current = null;
    filed.current = false;
    setChat(null);
    setChatGeneration((value) => value + 1);
  };

  const shownChat = chat ?? EMPTY_CHAT;
  const recordMap = new Map(records.map((entry) => [entry.id, entry]));
  const pendingPaper = bridge.pending === "kb:get-paper";
  const status = error ?? busy ?? (pendingPaper ? "Getting the paper from this tab…" : null);
  const chatting = !onPdf && mode === "ask";
  async function openEntry(entryId: string, projectId?: string) {
    const standaloneWindow = !tab ? window.open("about:blank", "_blank") : null;
    try {
      if (projectId) {
        const { workspaceService } = await import("@/features/workspace/lib/service-instance");
        await workspaceService.refresh();
        await workspaceService.setActiveProject(projectId);
      }
      if (tab) bridge.openEntry(entryId);
      else if (standaloneWindow)
        standaloneWindow.location.href = `/notes?note=${encodeURIComponent(entryId)}`;
      else setError("Open the workspace to view your saved roadmap.");
    } catch (cause) {
      standaloneWindow?.close();
      setError(cause instanceof Error ? cause.message : "Couldn't open the workspace.");
    }
  }

  async function newNote() {
    setError(null);
    setBusy("Creating a note…");
    const standaloneWindow = !tab ? window.open("about:blank", "_blank") : null;
    try {
      const { workspaceService } = await import("@/features/workspace/lib/service-instance");
      await workspaceService.refresh();
      const note = await workspaceService.saveNote({
        projectId: workspaceService.snapshot().activeProjectId,
        title: "Untitled",
        body: "",
        question: false,
        resolved: false,
      });
      if (tab) bridge.openEntry(note.id);
      else if (standaloneWindow)
        standaloneWindow.location.href = `/notes?note=${encodeURIComponent(note.id)}`;
      else setError("Your note was saved. Open the workspace to continue writing.");
    } catch (cause) {
      standaloneWindow?.close();
      setError(cause instanceof Error ? cause.message : "Couldn't create a note.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="ext theme-obsidian" data-theme="dark">
      <header className="ext-topbar">
        <span className="ext-vault-name">Fluid Research</span>
        <button
          type="button"
          className="clickable-icon"
          aria-label="New note"
          title="New note"
          onClick={() => void newNote()}
          disabled={Boolean(busy)}
        >
          <FilePenLine size={16} />
        </button>
        {chatting && (
          <button
            type="button"
            className="clickable-icon"
            aria-label="New chat"
            title="New chat"
            onClick={newChat}
          >
            <SquarePen size={16} />
          </button>
        )}
        <button
          type="button"
          className="clickable-icon"
          aria-label="Open workspace"
          title="Open workspace"
          onClick={() => (tab ? bridge.openApp() : window.open("/", "_blank"))}
        >
          <ExternalLink size={16} />
        </button>
      </header>

      <section
        className="ext-hero"
        data-compact={
          (chatting && shownChat.messages.length > 0) ||
          (!onPdf && mode === "project" && projectActive) ||
          undefined
        }
      >
        <AgentSprite
          greeting={
            onPdf ? "Ready when you are" : chatting ? "Ask me anything" : "What will you research?"
          }
        />
      </section>

      {tab && (
        <div className="ext-tab" title={tab.url}>
          {onPdf ? <FileText size={14} aria-hidden /> : <Globe size={14} aria-hidden />}
          <span>{tab.title || "Untitled tab"}</span>
        </div>
      )}

      {!onPdf && (
        <div className="ext-modes" role="tablist" aria-label="What to do">
          {(
            [
              ["project", "New project"],
              ["ask", "Ask"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={mode === id}
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {status && (
        <p className={error ? "ext-status is-error" : "ext-status"} role="status">
          {!error && <LoaderCircle size={13} className="ext-spin" aria-hidden />}
          {status}
        </p>
      )}

      {onPdf ? (
        <section className="ext-pdf" aria-label="This paper">
          {!record ? (
            <>
              <button
                type="button"
                className="mod-cta ext-wide"
                onClick={() => request({ kind: "analyze" })}
                disabled={Boolean(busy) || pendingPaper}
              >
                Analyze this paper
              </button>
              <p className="ext-hint">
                Saves it to your workspace, then finds what to know first, related papers, and
                conflicts with the published literature and papers you&apos;ve saved.
              </p>
            </>
          ) : (
            <>
              <ol className="ext-steps" aria-label="Analysis progress">
                {PIPELINE_STEPS.map(({ id, label }) => {
                  const step = record.pipeline?.[id];
                  const state = step?.status ?? "pending";
                  return (
                    <li key={id} data-status={state}>
                      <span className="ext-step-dot" aria-hidden>
                        {state === "running" && <LoaderCircle size={12} className="ext-spin" />}
                      </span>
                      <span>{label}</span>
                      <span className="ext-step-status">{STATUS_TEXT[state]}</span>
                      {step?.message && <small>{step.message}</small>}
                    </li>
                  );
                })}
              </ol>
              {!running &&
                (!record.pipeline ||
                  Object.values(record.pipeline).some((step) => step.status === "failed")) && (
                  <button
                    type="button"
                    className="mod-muted ext-wide"
                    onClick={() => void runPipeline(record.document, undefined)}
                  >
                    Finish the analysis
                  </button>
                )}
              {record.analysis && <Summary record={record} />}
              <Conflicts record={record} />
              <RelatedPapers record={record} />
            </>
          )}

          <div className="ext-send">
            <label className="ext-page">
              Page
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={pageCount ?? undefined}
                value={pageValue}
                onChange={(event) =>
                  tab && setPageDraft({ url: tab.url, value: event.target.value })
                }
              />
              {pageCount && <span>of {pageCount}</span>}
            </label>
            <button
              type="button"
              className={record ? "mod-cta" : "mod-muted"}
              onClick={openInVault}
              disabled={Boolean(busy) || pendingPaper}
            >
              <ExternalLink size={14} aria-hidden /> Open in workspace
            </button>
          </div>
          <p className="ext-hint">
            Opens the paper in your workspace at this page. Chrome&apos;s PDF viewer doesn&apos;t
            tell extensions where you are, so set the page you&apos;re on.
          </p>
        </section>
      ) : mode === "project" ? (
        <ProjectBuilder onOpenEntry={openEntry} onActiveChange={setProjectActive} />
      ) : (
        <ChatView
          key={chatGeneration}
          compact
          chat={shownChat}
          records={recordMap}
          passage={null}
          onPassageChange={() => {}}
          onChange={updateChat}
          onOpenPage={(documentId, pageNumber) =>
            tab ? bridge.openApp(documentId, pageNumber) : window.open(`/?paper=${documentId}`)
          }
          contextActions={
            tab?.kind === "page" ? (
              <button
                type="button"
                className="context-add"
                onClick={() => request({ kind: "attach" })}
                disabled={Boolean(busy) || pendingPaper}
              >
                <Globe size={14} aria-hidden /> Use this page
              </button>
            ) : null
          }
        />
      )}
    </main>
  );
}

/** Shown until the first change creates the real chat, which gets its own ID. */
const EMPTY_CHAT = emptyChat();

function Summary({ record }: { record: DocumentRecord }) {
  const analysis = record.analysis!;
  const prerequisites = analysis.learningPath.slice(0, 5).flatMap((item) => {
    const concept = analysis.graph.concepts.find((entry) => entry.id === item.conceptId);
    return concept ? [concept.name] : [];
  });
  return (
    <div className="ext-summary">
      <h2>{analysis.understanding.subject}</h2>
      {prerequisites.length > 0 && (
        <>
          <h3>Know these first</h3>
          <ol>
            {prerequisites.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ol>
        </>
      )}
      <div className="ext-tags">
        {analysis.understanding.topics.slice(0, 6).map((topic) => (
          <span key={topic}>#{topic.replace(/\s+/g, "-")}</span>
        ))}
      </div>
    </div>
  );
}
