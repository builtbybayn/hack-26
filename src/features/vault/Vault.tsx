"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Bookmark,
  ChevronsUpDown,
  CircleQuestionMark,
  FileUp,
  Folder,
  MessagesSquare,
  Network,
  PanelLeft,
  Search,
  Settings,
  SquarePen,
  FileSearch,
} from "lucide-react";
import { AgentStatus } from "@/features/agent/AgentStatus";
import type { Annotation, ChatPassage, VaultChat, VaultEntry, VaultPaper } from "@/types/vault";
import { ChatView } from "./ChatView";
import { FileExplorer } from "./FileExplorer";
import { InsightsPane } from "./InsightsPane";
import { ConfirmDelete, HelpModal, QuickSwitcher, SettingsModal } from "./Modals";
import { NoteView } from "./NoteView";
import { PaperView, type PaperFocus } from "./reader/PaperView";
import { BookmarksPane, SearchPane } from "./SidePanes";
import { loadLocal, saveLocal, useSettings } from "./use-settings";
import { useVault } from "./use-vault";
import { collectDescendants, findByName, type SortOrder } from "./vault-tree";
import { Workspace } from "./Workspace";
import { initialWorkspace, restoreWorkspace, workspaceReducer } from "./workspace-state";
import "@/components/theme/obsidian-theme.css";
import "./vault.css";

type LeftTab = "files" | "search" | "bookmarks";
type Modal =
  | { type: "switcher" }
  | { type: "settings" }
  | { type: "help" }
  | { type: "delete"; entry: VaultEntry };

const PHONE_QUERY = "(max-width: 768px)";
const ACCEPTED_FILES = ".pdf,.md,.markdown,.txt,application/pdf,text/markdown,text/plain";

/** The research vault: an Obsidian-style home for papers, notes, and AI chats. */
export function Vault() {
  const vault = useVault();
  const settings = useSettings();
  const entries = useMemo(() => vault.entries ?? [], [vault.entries]);
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

  const [workspace, dispatch] = useReducer(workspaceReducer, null, initialWorkspace);
  const [restored, setRestored] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [leftTab, setLeftTab] = useState<LeftTab>("files");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [sortOrder, setSortOrder] = useState<SortOrder>("name-asc");
  const [modal, setModal] = useState<Modal | null>(null);
  const [focus, setFocus] = useState<PaperFocus | null>(null);
  const [drafts, setDrafts] = useState<Record<string, ChatPassage | null>>({});
  const [importing, setImporting] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const importTarget = useRef<string | null>(null);

  // Restore the previous layout once the vault has loaded (first render with entries).
  if (!restored && vault.entries) {
    setRestored(true);
    const saved = restoreWorkspace(loadLocal("workspace", null), new Set(byId.keys()));
    if (saved) dispatch({ type: "restore", state: saved });
    setCollapsed(new Set(loadLocal<string[]>("collapsedFolders", [])));
    setSortOrder(loadLocal<SortOrder>("sortOrder", "name-asc"));
    // On phones the sidebars cover the work area, so start with both closed.
    const phone = window.matchMedia(PHONE_QUERY).matches;
    setLeftOpen(!phone && loadLocal("leftOpen", true));
    setRightOpen(!phone && loadLocal("rightOpen", true));
    // Sent from the extension: ?paper=<documentId>&page=<n> opens the paper at that page.
    const params = new URLSearchParams(window.location.search);
    const paperId = params.get("paper");
    const paper = entries.find(
      (entry): entry is VaultPaper => entry.kind === "paper" && entry.documentId === paperId,
    );
    if (paper) {
      dispatch({ type: "open", entryId: paper.id });
      setSelectedId(paper.id);
      const page = Number(params.get("page"));
      if (page >= 1)
        // Fixed nonce: this runs once per page load (other focus requests use timestamps).
        setFocus({ documentId: paper.documentId, pageNumber: Math.floor(page), nonce: -1 });
    }
  }

  // Drop ?paper=…&page=… once handled, so a reload doesn't jump back there.
  useEffect(() => {
    if (restored && window.location.search) window.history.replaceState(null, "", "/");
  }, [restored]);

  useEffect(() => {
    if (restored) saveLocal("workspace", workspace);
  }, [workspace, restored]);
  useEffect(() => {
    if (!restored) return;
    saveLocal("collapsedFolders", [...collapsed]);
    saveLocal("sortOrder", sortOrder);
    saveLocal("leftOpen", leftOpen);
    saveLocal("rightOpen", rightOpen);
  }, [collapsed, sortOrder, leftOpen, rightOpen, restored]);

  const activePane =
    workspace.panes.find((pane) => pane.id === workspace.activePaneId) ?? workspace.panes[0];
  const activeTab = activePane.tabs.find((tab) => tab.id === activePane.activeTabId);
  const activeEntry = activeTab?.entryId ? (byId.get(activeTab.entryId) ?? null) : null;
  // The insights sidebar follows the paper you're looking at, even while chatting beside it.
  const insightEntry =
    activeEntry?.kind === "paper"
      ? activeEntry
      : (workspace.panes
          .map((pane) => pane.tabs.find((tab) => tab.id === pane.activeTabId)?.entryId)
          .map((id) => (id ? byId.get(id) : undefined))
          .find((entry): entry is VaultPaper => entry?.kind === "paper") ?? activeEntry);
  const insightRecord =
    insightEntry?.kind === "paper" ? (vault.records.get(insightEntry.documentId) ?? null) : null;

  const open = useCallback(
    (entry: VaultEntry, options: { newTab?: boolean; split?: boolean } = {}) => {
      if (entry.kind === "folder") return;
      dispatch({ type: "open", entryId: entry.id, ...options });
      setSelectedId(entry.id);
      // Reveal it in the tree.
      setCollapsed((current) => {
        let parent = entry.parentId;
        const next = new Set(current);
        while (parent) {
          next.delete(parent);
          parent = byId.get(parent)?.parentId ?? null;
        }
        return next.size === current.size ? current : next;
      });
      if (window.matchMedia(PHONE_QUERY).matches) setLeftOpen(false);
    },
    [byId],
  );

  const isOpenAnywhere = (entryId: string) =>
    workspace.panes.some((pane) => pane.tabs.some((tab) => tab.entryId === entryId));

  /** Shows a paper at a page (and annotation), beside a chat if that's where you came from. */
  const openPaperAt = (documentId: string, pageNumber: number, annotationId?: string) => {
    const paper = entries.find(
      (entry): entry is VaultPaper => entry.kind === "paper" && entry.documentId === documentId,
    );
    if (!paper) return;
    const fromChat = activeEntry?.kind === "chat";
    open(paper, { split: fromChat && !isOpenAnywhere(paper.id) });
    setFocus({ documentId, pageNumber, annotationId, nonce: Date.now() });
  };

  const selectedFolder = () => {
    const selected = selectedId ? byId.get(selectedId) : undefined;
    if (!selected) return null;
    return selected.kind === "folder" ? selected.id : selected.parentId;
  };

  const newNote = (parentId: string | null, name?: string) => {
    const note = vault.createNote(parentId, name);
    open(note);
    return note;
  };

  const newChat = (documentIds: string[], split = false) => {
    const chat = vault.createChat(documentIds);
    open(chat, { split });
    return chat;
  };

  /** "Ask AI" from a paper: open (or reuse) a chat about it beside the paper. */
  const askAi = (passage: ChatPassage) => {
    const openChat = workspace.panes
      .flatMap((pane) => pane.tabs)
      .map((tab) => (tab.entryId ? byId.get(tab.entryId) : undefined))
      .find(
        (entry): entry is VaultChat =>
          entry?.kind === "chat" && entry.documentIds.includes(passage.documentId),
      );
    const chat = openChat ?? vault.createChat([passage.documentId]);
    setDrafts((current) => ({ ...current, [chat.id]: passage }));
    dispatch({ type: "open", entryId: chat.id, split: true });
  };

  const startImport = (parentId: string | null) => {
    importTarget.current = parentId;
    fileInput.current?.click();
  };

  const importFiles = async (files: File[], parentId: string | null) => {
    setImporting((count) => count + files.length);
    for (const file of files) {
      const paper = await vault.importPaper(file, parentId);
      setImporting((count) => count - 1);
      if (paper) open(paper, { newTab: true });
    }
  };

  const deleteEntry = async (entry: VaultEntry) => {
    const ids = await vault.remove(entry);
    dispatch({ type: "forget", entryIds: ids });
    if (selectedId && ids.includes(selectedId)) setSelectedId(null);
  };

  const openLink = (name: string, parentId: string | null) => {
    const target = findByName(entries, name);
    if (target) open(target);
    else newNote(parentId, name);
  };

  // Global shortcuts.
  const shortcuts = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    shortcuts.current = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (mod && !event.shiftKey && event.key.toLowerCase() === "o") {
        event.preventDefault();
        setModal({ type: "switcher" });
      } else if (mod && event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setLeftOpen(true);
        setLeftTab("search");
      } else if (event.altKey && event.code === "KeyN") {
        event.preventDefault();
        newNote(selectedFolder());
      } else if (event.altKey && event.code === "KeyC") {
        event.preventDefault();
        newChat(insightRecord ? [insightRecord.id] : []);
      }
    };
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => shortcuts.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const renderView = (entry: VaultEntry | null, paneId: string) => {
    if (!vault.entries) return <div className="empty-state" />;
    if (!entry)
      return (
        <EmptyTab
          onImport={() => startImport(selectedFolder())}
          onNewNote={() => newNote(selectedFolder())}
          onNewChat={() => newChat([])}
          onSwitcher={() => setModal({ type: "switcher" })}
          onClose={() => {
            const pane = workspace.panes.find((candidate) => candidate.id === paneId);
            if (pane) dispatch({ type: "close", paneId, tabId: pane.activeTabId });
          }}
        />
      );
    switch (entry.kind) {
      case "note":
        return (
          <NoteView
            key={entry.id}
            note={entry}
            entries={entries}
            onChange={(patch) => vault.update(entry, patch)}
            onRename={(name) => vault.rename(entry, name)}
            onOpenLink={(name) => openLink(name, entry.parentId)}
          />
        );
      case "paper":
        return (
          <PaperView
            key={entry.id}
            entry={entry}
            record={vault.records.get(entry.documentId) ?? null}
            author={settings.authorName}
            focus={focus}
            onAskAi={askAi}
          />
        );
      case "chat":
        return (
          <ChatView
            key={entry.id}
            chat={entry}
            records={vault.records}
            passage={drafts[entry.id] ?? null}
            onPassageChange={(passage) =>
              setDrafts((current) => ({ ...current, [entry.id]: passage }))
            }
            onChange={(patch) => vault.update(entry, patch)}
            onOpenPage={(documentId, pageNumber) => openPaperAt(documentId, pageNumber)}
          />
        );
      default:
        return null;
    }
  };

  const words = activeEntry?.kind === "note" ? (activeEntry.body.match(/\S+/g)?.length ?? 0) : null;

  return (
    <div
      className="vault theme-obsidian"
      data-theme={settings.theme}
      data-left-open={leftOpen || undefined}
      data-right-open={rightOpen || undefined}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        if (!event.dataTransfer.files.length) return;
        event.preventDefault();
        void importFiles([...event.dataTransfer.files], selectedFolder());
      }}
    >
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept={ACCEPTED_FILES}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) void importFiles(files, importTarget.current);
        }}
      />

      <nav className="workspace-ribbon" aria-label="Ribbon">
        <button
          type="button"
          className="clickable-icon sidebar-toggle-button"
          aria-label={leftOpen ? "Collapse left sidebar" : "Expand left sidebar"}
          aria-pressed={leftOpen}
          title={leftOpen ? "Collapse left sidebar" : "Expand left sidebar"}
          onClick={() => {
            setLeftOpen(!leftOpen);
            if (!leftOpen && window.matchMedia(PHONE_QUERY).matches) setRightOpen(false);
          }}
        >
          <PanelLeft size={18} />
        </button>
        <div className="side-dock-actions">
          <button
            type="button"
            className="clickable-icon side-dock-ribbon-action"
            aria-label="Open quick switcher"
            title="Open quick switcher (Ctrl+O)"
            onClick={() => setModal({ type: "switcher" })}
          >
            <FileSearch size={18} />
          </button>
          <button
            type="button"
            className="clickable-icon side-dock-ribbon-action"
            aria-label="Import paper"
            title="Import paper (PDF)"
            onClick={() => startImport(selectedFolder())}
          >
            <FileUp size={18} />
          </button>
          <button
            type="button"
            className="clickable-icon side-dock-ribbon-action"
            aria-label="New note"
            title="New note (Alt+N)"
            onClick={() => newNote(selectedFolder())}
          >
            <SquarePen size={18} />
          </button>
          <button
            type="button"
            className="clickable-icon side-dock-ribbon-action"
            aria-label="Chat with AI"
            title="Chat with AI (Alt+C)"
            onClick={() => newChat(insightRecord ? [insightRecord.id] : [], !!insightRecord)}
          >
            <MessagesSquare size={18} />
          </button>
          <a
            className="clickable-icon side-dock-ribbon-action"
            aria-label="Concept map (classic workspace)"
            title="Concept map (classic workspace)"
            href="/classic"
          >
            <Network size={18} />
          </a>
        </div>
      </nav>

      <aside
        className="workspace-split mod-left-split"
        aria-label="Left sidebar"
        hidden={!leftOpen}
      >
        <div className="workspace-tab-header-container sidebar-tabs">
          {(
            [
              ["files", "Files", <Folder key="f" size={18} />],
              ["search", "Search", <Search key="s" size={18} />],
              ["bookmarks", "Bookmarks", <Bookmark key="b" size={18} />],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              className="clickable-icon sidebar-tab"
              aria-label={label}
              title={label}
              aria-pressed={leftTab === id}
              onClick={() => setLeftTab(id)}
            >
              {icon}
            </button>
          ))}
        </div>
        <div className="sidebar-content">
          {leftTab === "files" && (
            <FileExplorer
              entries={entries}
              activeEntryId={activeEntry?.id ?? null}
              selectedId={selectedId}
              collapsed={collapsed}
              sortOrder={sortOrder}
              running={vault.running}
              renamingId={renamingId}
              onRenamingChange={setRenamingId}
              onSelect={setSelectedId}
              onOpen={(entry, newTab) => open(entry, { newTab })}
              onOpenToRight={(entry) => open(entry, { split: true })}
              onToggleFolder={(id) =>
                setCollapsed((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onCollapseAll={() =>
                setCollapsed(
                  new Set(entries.filter((entry) => entry.kind === "folder").map((e) => e.id)),
                )
              }
              onSortOrder={setSortOrder}
              onNewNote={(parentId) => {
                const note = newNote(parentId);
                setRenamingId(note.id);
              }}
              onNewFolder={(parentId) => {
                const folder = vault.createFolder(parentId);
                if (parentId)
                  setCollapsed((current) => {
                    const next = new Set(current);
                    next.delete(parentId);
                    return next;
                  });
                setSelectedId(folder.id);
                setRenamingId(folder.id);
              }}
              onImport={startImport}
              onDropFiles={(files, parentId) => void importFiles(files, parentId)}
              onRename={(entry, name) => vault.rename(entry, name)}
              onMove={(entry, parentId) => vault.move(entry, parentId)}
              onDelete={(entry) => setModal({ type: "delete", entry })}
              onToggleBookmark={(entry) => vault.update(entry, { bookmarked: !entry.bookmarked })}
              onNewChat={(entry) => entry.kind === "paper" && newChat([entry.documentId], true)}
            />
          )}
          {leftTab === "search" && (
            <SearchPane
              entries={entries}
              records={vault.records}
              onOpen={(entry, pageNumber) =>
                entry.kind === "paper" && pageNumber
                  ? openPaperAt(entry.documentId, pageNumber)
                  : open(entry)
              }
            />
          )}
          {leftTab === "bookmarks" && (
            <BookmarksPane entries={entries} onOpen={(entry) => open(entry)} />
          )}
        </div>
        {(importing > 0 || vault.importError) && (
          <div className="sidebar-notice" role="status">
            {importing > 0 ? (
              `Importing ${importing} file${importing === 1 ? "" : "s"}…`
            ) : (
              <>
                <span>{vault.importError}</span>
                <button type="button" className="link-button" onClick={vault.clearImportError}>
                  Dismiss
                </button>
              </>
            )}
          </div>
        )}
        <div className="workspace-sidedock-vault-profile">
          <button
            type="button"
            className="vault-switcher"
            title="Vault settings"
            onClick={() => setModal({ type: "settings" })}
          >
            <ChevronsUpDown size={14} aria-hidden />
            <span>{settings.vaultName}</span>
          </button>
          <button
            type="button"
            className="clickable-icon"
            aria-label="Help"
            title="Help"
            onClick={() => setModal({ type: "help" })}
          >
            <CircleQuestionMark size={18} />
          </button>
          <button
            type="button"
            className="clickable-icon"
            aria-label="Settings"
            title="Settings"
            onClick={() => setModal({ type: "settings" })}
          >
            <Settings size={18} />
          </button>
        </div>
      </aside>

      <main className="workspace-main">
        <Workspace
          state={workspace}
          dispatch={dispatch}
          byId={byId}
          rightOpen={rightOpen}
          onToggleRight={() => {
            setRightOpen(!rightOpen);
            if (!rightOpen && window.matchMedia(PHONE_QUERY).matches) setLeftOpen(false);
          }}
          renderView={renderView}
        />
      </main>

      <aside
        className="workspace-split mod-right-split"
        aria-label="Right sidebar"
        hidden={!rightOpen}
      >
        <InsightsPane
          entry={insightEntry}
          entries={entries}
          record={insightRecord}
          running={!!insightRecord && vault.running.has(insightRecord.id)}
          onRunAnalysis={() => insightRecord && void vault.runPipeline(insightRecord)}
          onOpenEntry={(entry) => open(entry)}
          onOpenAnnotation={(annotation: Annotation) =>
            openPaperAt(annotation.documentId, annotation.pageNumber, annotation.id)
          }
          onOpenPage={(pageNumber) => insightRecord && openPaperAt(insightRecord.id, pageNumber)}
        />
      </aside>

      {(leftOpen || rightOpen) && (
        <button
          type="button"
          className="mobile-scrim"
          aria-label="Close sidebars"
          tabIndex={-1}
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
        />
      )}

      <footer className="status-bar">
        {words !== null && (
          <span className="status-bar-item">
            {words.toLocaleString()} {words === 1 ? "word" : "words"}
          </span>
        )}
        <span className="status-bar-item">
          <AgentStatus />
        </span>
      </footer>

      {modal?.type === "switcher" && (
        <QuickSwitcher
          entries={entries}
          onOpen={(entry, newTab) => open(entry, { newTab })}
          onCreateNote={(name) => newNote(selectedFolder(), name)}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "settings" && <SettingsModal onClose={() => setModal(null)} />}
      {modal?.type === "help" && <HelpModal onClose={() => setModal(null)} />}
      {modal?.type === "delete" && (
        <ConfirmDelete
          entry={modal.entry}
          count={collectDescendants(entries, modal.entry.id).length}
          onConfirm={() => void deleteEntry(modal.entry)}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function EmptyTab({
  onImport,
  onNewNote,
  onNewChat,
  onSwitcher,
  onClose,
}: {
  onImport: () => void;
  onNewNote: () => void;
  onNewChat: () => void;
  onSwitcher: () => void;
  onClose: () => void;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state-container">
        <div className="empty-state-title">No file is open</div>
        <div className="empty-state-action-list">
          <button type="button" className="empty-state-action" onClick={onImport}>
            Import a paper (PDF)
          </button>
          <button type="button" className="empty-state-action" onClick={onNewNote}>
            Create new note <kbd>Alt+N</kbd>
          </button>
          <button type="button" className="empty-state-action" onClick={onNewChat}>
            Chat with AI <kbd>Alt+C</kbd>
          </button>
          <button type="button" className="empty-state-action" onClick={onSwitcher}>
            Go to file <kbd>Ctrl+O</kbd>
          </button>
          <button type="button" className="empty-state-action" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
