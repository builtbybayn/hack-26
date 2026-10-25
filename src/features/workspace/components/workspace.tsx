"use client";
import { reportAgentError } from "@/lib/agent-activity";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Columns2,
  FilePenLine,
  FileText,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  X,
  Trash2,
} from "lucide-react";
import type {
  PointerEvent as ReactPointerEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Section, WorkspaceData } from "@/features/workspace/lib/models";
import {
  clampPanelRatio,
  mergePanels,
  transferTab,
  type WorkspaceTab as Tab,
} from "@/features/workspace/lib/workspace-panels";
import { WorkspaceItemScope, useWorkspace } from "@/features/workspace/lib/workspace-context";
import { copyText, toBibtex } from "@/features/workspace/lib/bibtex";
import { ExplorerGroup, TreeFolder, navigation } from "./workspace-navigation";
import { RailTooltip } from "./rail-tooltip";
import { FluidResearchLogo } from "./fluid-research-logo";
import { useAIActivity } from "@/features/workspace/lib/ai-activity";
import { routeWorkspaceTab } from "@/features/workspace/lib/workspace-routing";
import { KnowledgeProvider } from "@/features/workspace/lib/knowledge-context";
import { KnowledgeGraph } from "./knowledge-graph";
import GlassAssistant from "@/features/agent/GlassAssistant";
import { NewTab } from "./new-tab";
import { AssistantPanel } from "./workspace-assistant";
import {
  ConfirmTrash,
  ExplorerContextMenu,
  TrashDialog,
  type ExplorerMenuState,
  type ExplorerTarget,
} from "./explorer-menu";
import { flushNoteEdits } from "../lib/note-flush";
import {
  Overview,
  LibraryView,
  ReaderView,
  RoadmapView,
  EvidenceView,
  NotesView,
  WritingView,
  ExtensionView,
} from "./workspace-views";

const views: Record<Section, () => ReactNode> = {
  overview: Overview,
  library: LibraryView,
  reader: ReaderView,
  roadmap: RoadmapView,
  evidence: EvidenceView,
  notes: NotesView,
  writing: WritingView,
  extension: ExtensionView,
  graph: () => null,
};
const subscribeHydration = () => () => {};
export default function Workspace() {
  const hydrated = useSyncExternalStore(
    subscribeHydration,
    () => true,
    () => false,
  );
  const pathname = usePathname();
  const router = useRouter();
  const isWorkspaceRoute =
    pathname === "/" || navigation.some((item) => `/${item.id}` === pathname);
  const params = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [compactViewport, setCompactViewport] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => setCompactViewport(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const {
    data,
    assistantOpen,
    setAssistantOpen,
    notice,
    setNotice,
    service,
    activeDocumentId,
    setActiveDocumentId,
    createNote,
  } = useWorkspace();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.key.toLowerCase() !== "n" || event.shiftKey) return;
      if (
        (event.altKey && !event.ctrlKey && !event.metaKey) ||
        ((event.ctrlKey || event.metaKey) && !event.altKey)
      ) {
        event.preventDefault();
        void createNote();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createNote]);

  const routeKey = `${pathname}?${params.toString()}`;
  function routeTab(): Tab {
    return routeWorkspaceTab(pathname, params, data, activeDocumentId);
  }
  const [tabs, setTabs] = useState<Tab[]>(() => [routeTab()]);
  const [panel, setPanel] = useState(0);
  const [layout, setLayout] = useState<"single" | "right" | "down">("single");
  const [ratio, setRatio] = useState(50);
  const [splitMenu, setSplitMenu] = useState<number | null>(null);
  const [activeTabs, setActiveTabs] = useState<string[]>(() => [routeTab().id, ""]);
  const activeTab = activeTabs[panel];
  function setActiveTab(id: string, target = panel) {
    setActiveTabs((items) => items.map((value, index) => (index === target ? id : value)));
  }
  function openTab(tab: Tab, target = panel) {
    if (tab.section === "reader" && !tab.documentId)
      tab = {
        ...tab,
        documentId:
          data.documents.find(
            (doc) => doc.id === activeDocumentId && doc.projectId === data.activeProjectId,
          )?.id ||
          data.documents.find(
            (doc) => doc.projectId === data.activeProjectId && doc.status === "ready",
          )?.id,
      };
    setTabs((items) =>
      items.some((item) => item.id === tab.id)
        ? items.map((item) =>
            item.id === tab.id
              ? {
                  ...item,
                  ...(tab.passageId ? { passageId: tab.passageId } : {}),
                  ...(tab.graphMode ? { graphMode: tab.graphMode } : {}),
                }
              : item,
          )
        : [...items, { ...tab, panel: target }],
    );
    const existing = tabs.find((item) => item.id === tab.id);
    const destination = existing ? (existing.panel ?? 0) : target;
    setPanel(destination);
    setActiveTab(tab.id, destination);
  }
  function moveTab(id: string, target: number) {
    const moved = transferTab(tabs, activeTabs, id, target, data.activeProjectId);
    setTabs(moved.tabs);
    setActiveTabs(moved.active);
    setPanel(target);
  }
  function split(direction: "right" | "down", target: number) {
    setLayout(direction);
    setRatio(50);
    setSplitMenu(null);
    if (layout === "single") {
      const original = tabs.find((item) => item.id === activeTabs[target]);
      const tab: Tab = original
        ? { ...original, id: crypto.randomUUID(), panel: 1 }
        : { id: crypto.randomUUID(), section: "empty", projectId: data.activeProjectId, panel: 1 };
      setTabs((items) => [...items, tab]);
      setActiveTab(tab.id, 1);
      setPanel(1);
    }
  }
  function closeSplit(target: number) {
    const merged = mergePanels(tabs, activeTabs, target);
    setTabs(merged.tabs);
    setActiveTabs(merged.active);
    setPanel(0);
    setLayout("single");
    setSplitMenu(null);
  }
  const resolvedRoute = routeTab();
  const routeIdentity = `${routeKey}:${resolvedRoute.id}:${resolvedRoute.contentProjectId || ""}`;
  const [shownRoute, setShownRoute] = useState(routeIdentity);
  if (routeIdentity !== shownRoute) {
    setShownRoute(routeIdentity);
    openTab(resolvedRoute);
  }
  const currentTab = tabs.find(
    (tab) => tab.id === activeTab && tab.projectId === data.activeProjectId,
  );
  function closeTab(id: string) {
    const tab = tabs.find((item) => item.id === id);
    const target = tab?.panel ?? 0;
    const remaining = tabs.filter((tab) => tab.id !== id);
    setTabs(remaining);
    if (activeTabs[target] === id)
      setActiveTab(
        remaining
          .filter((tab) => tab.projectId === data.activeProjectId && (tab.panel ?? 0) === target)
          .at(-1)?.id || "",
        target,
      );
  }
  function newTab(target = panel) {
    const tab: Tab = {
      id: crypto.randomUUID(),
      section: "empty",
      projectId: data.activeProjectId,
      panel: target,
    };
    setTabs((items) => [...items, tab]);
    setPanel(target);
    setActiveTab(tab.id, target);
  }
  function tabTitle(tab: Tab) {
    if (tab.section === "graph" && tab.graphMode === "brain") return "Second Brain";
    return tab.documentId
      ? data.documents.find((doc) => doc.id === tab.documentId)?.title || "Source"
      : tab.noteId
        ? data.notes.find((note) => note.id === tab.noteId)?.title || "Note"
        : navigation.find((item) => item.id === tab.section)?.label || "New tab";
  }
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [explorerMenu, setExplorerMenu] = useState<ExplorerMenuState | null>(null);
  const [confirmTrash, setConfirmTrash] = useState<ExplorerTarget | null>(null);
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashBusy, setTrashBusy] = useState(false);
  const [trashError, setTrashError] = useState("");
  const [undoItem, setUndoItem] = useState<{ id: string; name: string } | null>(null);
  const contextTarget = useRef<HTMLElement | null>(null);

  function showExplorerMenu(event: ReactMouseEvent<HTMLElement>, target: ExplorerTarget) {
    event.preventDefault();
    event.stopPropagation();
    contextTarget.current = event.currentTarget;
    const rect = event.currentTarget.getBoundingClientRect();
    setExplorerMenu({
      target,
      x: event.clientX || rect.left + 16,
      y: event.clientY || rect.bottom,
    });
  }
  function closeExplorerMenu() {
    setExplorerMenu(null);
    contextTarget.current?.focus({ preventScroll: true });
  }
  async function openExplorerItem(target: ExplorerTarget) {
    closeExplorerMenu();
    try {
      if (target.projectId) await service.setActiveProject(target.projectId);
      router.push(
        target.kind === "note"
          ? `/notes?note=${encodeURIComponent(target.id)}`
          : target.kind === "source"
            ? `/reader?doc=${encodeURIComponent(target.id)}`
            : target.kind === "folder" && target.name.toLowerCase().startsWith("notes")
              ? "/notes"
              : target.kind === "folder" && target.name.toLowerCase().startsWith("papers")
                ? "/library"
                : "/overview",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Couldn't open this item.");
    }
  }
  function validTab(tab: Tab, snapshot: WorkspaceData) {
    return (
      snapshot.projects.some((item) => item.id === tab.projectId) &&
      (!tab.contentProjectId ||
        snapshot.projects.some((item) => item.id === tab.contentProjectId)) &&
      (!tab.noteId || snapshot.notes.some((item) => item.id === tab.noteId)) &&
      (!tab.documentId ||
        snapshot.documents.some(
          (item) =>
            item.id === tab.documentId &&
            item.projectId === (tab.contentProjectId || tab.projectId),
        ))
    );
  }
  async function moveToTrash(target: ExplorerTarget) {
    setTrashBusy(true);
    setTrashError("");
    try {
      await flushNoteEdits();
      const id = await service.trashItem(target.id, target.kind);
      const snapshot = service.snapshot();
      const kept = new Set(tabs.filter((tab) => validTab(tab, snapshot)).map((tab) => tab.id));
      setTabs((current) => current.filter((tab) => validTab(tab, snapshot)));
      setActiveTabs((current) => current.map((id) => (kept.has(id) ? id : "")));
      if (currentTab && !validTab(currentTab, snapshot))
        router.replace(
          target.kind === "source" ? "/library" : target.kind === "note" ? "/notes" : "/overview",
        );
      setConfirmTrash(null);
      setUndoItem({ id, name: target.name });
      setNotice(`“${target.name}” moved to Trash.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't move this item to Trash.";
      setTrashError(message);
      setNotice(message);
    } finally {
      setTrashBusy(false);
    }
  }
  async function restoreItem(id: string) {
    setTrashBusy(true);
    setTrashError("");
    try {
      await service.restoreItem(id);
      setUndoItem((current) => (current?.id === id ? null : current));
      setNotice("Item restored.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Couldn't restore this item.";
      setTrashError(message);
      setNotice(message);
    } finally {
      setTrashBusy(false);
    }
  }
  const activity = useAIActivity();
  const errorPreviewCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => errorPreviewCleanup.current?.(), []);
  const [contrastBackdrop, setContrastBackdrop] = useState(false);
  const [testAnimation, setTestAnimation] = useState<"idle" | "researching" | "error" | null>(null);
  const assistantState = data.uploads.some(
    (job) => job.state === "processing" || job.state === "uploading",
  )
    ? "researching"
    : activity;
  const project =
    data.projects.find((item) => item.id === data.activeProjectId) || data.projects[0];
  async function createProject() {
    try {
      await service.createProject(projectName);
      setCreating(false);
      setProjectName("");
      setNotice("Project created. Add your first source in the library.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not create project.");
    }
  }
  const documents = data.documents.filter((item) => item.projectId === data.activeProjectId);
  // Explorer folders the user opened or closed; the rest use their default (see isFolderOpen).
  const [folderState, setFolderState] = useState<Record<string, boolean>>({});
  const isFolderOpen = (key: string, fallback: boolean) => folderState[key] ?? fallback;
  const setFolderOpen = (key: string, open: boolean) =>
    setFolderState((current) => ({ ...current, [key]: open }));
  const toggleFolder = (key: string, fallback: boolean) =>
    setFolderOpen(key, !isFolderOpen(key, fallback));
  function toggleExplorer() {
    if (window.matchMedia("(max-width: 1023px)").matches) {
      setSidebarOpen(true);
      setMenuOpen((open) => !open);
    } else setSidebarOpen((open) => !open);
  }
  function resizeSidebar(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  if (!hydrated || (data.activeProjectId === "loading" && !data.loadError))
    return (
      <main className="welcome-screen" role="status">
        Opening your saved workspace…
      </main>
    );
  if (data.loadError)
    return (
      <main className="welcome-screen" role="alert">
        <h1>Your workspace could not be opened</h1>
        <p>{data.loadError}</p>
        <button className="btn" onClick={() => void service.refresh().catch(() => {})}>
          Retry opening workspace
        </button>
      </main>
    );
  return (
    <KnowledgeProvider>
      <div
        onClickCapture={(event) => {
          if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
          const link = (event.target as Element).closest("a");
          if (!link || link.target === "_blank") return;
          const url = new URL(link.href, window.location.href);
          const targetSection =
            navigation.find((item) => `/${item.id}` === url.pathname)?.id ||
            (url.pathname === "/" ? "empty" : undefined);
          if (url.origin !== window.location.origin || !targetSection || url.hash) return;
          event.preventDefault();
          openTab(routeWorkspaceTab(url.pathname, url.searchParams, data, activeDocumentId));
          router.push(`${url.pathname}${url.search}`);
        }}
        className={`research-workspace ${sidebarOpen ? "" : "explorer-collapsed"} ${assistantOpen ? "assistant-docked" : ""}`}
        style={{ "--explorer-width": `${sidebarWidth}px` } as import("react").CSSProperties}
      >
        <a href="#main-content" className="skip-link">
          Skip to workspace
        </a>
        <nav className="workspace-rail no-print" aria-label="Research tools">
          <RailTooltip label="Home">
            <Link
              href="/"
              className={`rail-brand ${currentTab?.section === "empty" ? "is-active" : ""}`}
              aria-current={currentTab?.section === "empty" ? "page" : undefined}
              aria-label="Home"
            >
              <FluidResearchLogo />
              <span className="sr-only">Fluid Research</span>
            </Link>
          </RailTooltip>
          <div className="rail-tools">
            {navigation
              .filter((item) => item.rail)
              .map(({ id, label, icon: Icon }) => (
                <RailTooltip key={id} label={label}>
                  <Link
                    href={`/${id}`}
                    className={`rail-button ${currentTab?.section === id ? "is-active" : ""}`}
                    aria-label={label}
                    aria-current={currentTab?.section === id ? "page" : undefined}
                  >
                    <Icon size={21} strokeWidth={1.65} />
                  </Link>
                </RailTooltip>
              ))}
          </div>
          <RailTooltip
            label={assistantOpen ? "Close Research Assistant" : "Open Research Assistant"}
          >
            <button
              hidden={(sidebarOpen && !compactViewport) || (compactViewport && menuOpen)}
              className={`rail-button ${assistantOpen ? "is-active" : ""}`}
              aria-label={assistantOpen ? "Close Research Assistant" : "Open Research Assistant"}
              aria-expanded={assistantOpen}
              onClick={() => setAssistantOpen(!assistantOpen)}
            >
              <MessageCircle size={19} />
            </button>
          </RailTooltip>
        </nav>
        <header className="explorer-heading no-print" aria-label="File explorer header">
          <span>Fluid Research</span>
          <RailTooltip label="New project" className="explorer-create-tooltip">
            <button
              className="icon-button explorer-create"
              aria-label="New project"
              onClick={() => setCreating(true)}
            >
              <Plus size={16} />
            </button>
          </RailTooltip>
          <RailTooltip
            label={
              (compactViewport ? menuOpen : sidebarOpen)
                ? "Collapse research explorer"
                : "Expand research explorer"
            }
          >
            <button
              className="icon-button explorer-toggle"
              aria-label="Toggle research explorer"
              aria-controls="research-explorer"
              aria-expanded={compactViewport ? menuOpen : sidebarOpen}
              onClick={toggleExplorer}
            >
              {(compactViewport ? menuOpen : sidebarOpen) ? (
                <PanelLeftClose size={17} />
              ) : (
                <PanelLeftOpen size={17} />
              )}
            </button>
          </RailTooltip>
        </header>
        <aside
          id="research-explorer"
          className={`research-explorer no-print ${menuOpen ? "mobile-open" : ""}`}
          aria-label="Project navigation"
        >
          <div className="explorer-scroll">
            <ExplorerGroup title="Projects" count={data.projects.length}>
              {data.projects.map((item) => {
                const active = item.id === data.activeProjectId;
                const vaultFolder = (name: string) =>
                  data.folders?.find(
                    (folder) => folder.parentId === item.id && folder.name.toLowerCase() === name,
                  );
                const activate = () => {
                  if (!active)
                    void service
                      .setActiveProject(item.id)
                      .catch((error) => setNotice(error.message));
                };
                return (
                  <TreeFolder
                    key={item.id}
                    label={item.name}
                    open={isFolderOpen(item.id, active)}
                    onToggle={() => {
                      if (active) toggleFolder(item.id, true);
                      else {
                        setFolderOpen(item.id, true);
                        activate();
                      }
                    }}
                    onContextMenu={(event) =>
                      showExplorerMenu(event, {
                        id: item.id,
                        name: item.name,
                        kind: "project",
                        projectId: item.id,
                      })
                    }
                  >
                    <TreeFolder
                      label="Sources"
                      open={isFolderOpen(`${item.id}:sources`, true)}
                      onToggle={() => toggleFolder(`${item.id}:sources`, true)}
                      action={
                        active && (
                          <Link
                            href="/library"
                            className="explorer-group-action"
                            aria-label="Add source"
                            title="Add source"
                          >
                            <Plus size={14} />
                          </Link>
                        )
                      }
                      onContextMenu={(event) => {
                        const folder = vaultFolder("papers");
                        if (folder) showExplorerMenu(event, { ...folder, kind: "folder" });
                      }}
                    >
                      {data.documents
                        .filter((doc) => doc.projectId === item.id)
                        .map((doc) => (
                          <Link
                            key={doc.id}
                            href={`/reader?doc=${encodeURIComponent(doc.id)}`}
                            title={doc.title}
                            onContextMenu={(event) =>
                              showExplorerMenu(event, {
                                id: doc.id,
                                name: doc.title,
                                kind: "source",
                                projectId: doc.projectId,
                              })
                            }
                            onClick={() => {
                              activate();
                              setActiveDocumentId(doc.id);
                              setMenuOpen(false);
                            }}
                            className={`explorer-item source-item ${currentTab?.documentId === doc.id ? "is-active" : ""}`}
                          >
                            <FileText size={14} />
                            <span>{doc.title}</span>
                          </Link>
                        ))}
                    </TreeFolder>
                    <TreeFolder
                      label="Notes"
                      open={isFolderOpen(`${item.id}:notes`, true)}
                      onToggle={() => toggleFolder(`${item.id}:notes`, true)}
                      action={
                        active && (
                          <button
                            className="explorer-group-action"
                            aria-label="New note"
                            title="New note (Alt+N)"
                            onClick={() => void createNote()}
                          >
                            <Plus size={14} />
                          </button>
                        )
                      }
                      onContextMenu={(event) => {
                        const folder = vaultFolder("notes");
                        if (folder) showExplorerMenu(event, { ...folder, kind: "folder" });
                      }}
                    >
                      {data.notes
                        .filter((note) => note.projectId === item.id)
                        .map((note) => (
                          <Link
                            key={note.id}
                            href={`/notes?note=${encodeURIComponent(note.id)}`}
                            title={note.title}
                            onContextMenu={(event) =>
                              showExplorerMenu(event, {
                                id: note.id,
                                name: note.title,
                                kind: "note",
                                projectId: note.projectId,
                              })
                            }
                            onClick={() => {
                              activate();
                              setMenuOpen(false);
                            }}
                            className={`explorer-item source-item ${currentTab?.noteId === note.id ? "is-active" : ""}`}
                          >
                            <FilePenLine size={14} />
                            <span>{note.title}</span>
                          </Link>
                        ))}
                    </TreeFolder>
                  </TreeFolder>
                );
              })}
            </ExplorerGroup>
          </div>
          <div className="sidebar-assistant">
            <button
              className="sidebar-assistant-button"
              aria-label={assistantOpen ? "Close research assistant" : "Open research assistant"}
              aria-expanded={assistantOpen}
              onClick={() => setAssistantOpen(!assistantOpen)}
            >
              <span className="sidebar-assistant-orb">
                <GlassAssistant
                  state={testAnimation || assistantState}
                  contrastBackdrop={process.env.NODE_ENV === "development" && contrastBackdrop}
                  className="assistant-canvas"
                />
              </span>
            </button>
            {process.env.NODE_ENV === "development" && params.has("devtools") && (
              <details className="dev-controls">
                <summary>AI Animation Testing</summary>
                <p role="status">
                  ●{" "}
                  {testAnimation ||
                    (assistantState === "researching"
                      ? "Automatic · active request"
                      : assistantState === "error"
                        ? "Automatic · Error (4s maximum)"
                        : "Automatic")}
                </p>
                {(["idle", "researching", "error"] as const).map((state) => (
                  <button
                    key={state}
                    className="btn"
                    aria-pressed={
                      state === "error" ? activity === "error" : testAnimation === state
                    }
                    onClick={() => {
                      errorPreviewCleanup.current?.();
                      errorPreviewCleanup.current = null;
                      if (state === "error") {
                        setTestAnimation(null);
                        errorPreviewCleanup.current = reportAgentError(
                          "Development animation test",
                        );
                      } else setTestAnimation(state);
                    }}
                  >
                    {state === "researching" ? "Thinking" : state === "idle" ? "Idle" : "Error"}
                  </button>
                ))}
                <button
                  className="btn"
                  onClick={() => {
                    errorPreviewCleanup.current?.();
                    errorPreviewCleanup.current = null;
                    setTestAnimation(null);
                  }}
                >
                  Return to Automatic
                </button>
                <button
                  className="btn"
                  aria-pressed={contrastBackdrop}
                  onClick={() => setContrastBackdrop((value) => !value)}
                >
                  Contrast backdrop
                </button>
              </details>
            )}
          </div>
          <div className="explorer-footer">
            <span>{currentTab && currentTab.section !== "empty" ? project?.name : ""}</span>
            <button
              className="explorer-trash-button"
              onClick={() => {
                setTrashError("");
                setTrashOpen(true);
              }}
            >
              <Trash2 size={13} /> Trash{data.trash?.length ? ` (${data.trash.length})` : ""}
            </button>
          </div>
          <div
            className="explorer-resizer"
            role="separator"
            aria-label="Resize research explorer"
            aria-orientation="vertical"
            aria-valuemin={220}
            aria-valuemax={380}
            aria-valuenow={sidebarWidth}
            tabIndex={0}
            onPointerDown={resizeSidebar}
            onPointerMove={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                setSidebarWidth(Math.max(220, Math.min(380, event.clientX - 48)));
            }}
            onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                setSidebarWidth((width) =>
                  Math.max(220, Math.min(380, width + (event.key === "ArrowLeft" ? -16 : 16))),
                );
              }
            }}
          />
        </aside>
        {menuOpen && (
          <button
            className="explorer-overlay no-print"
            onClick={() => setMenuOpen(false)}
            aria-label="Close navigation"
          />
        )}
        <div className="workspace-center">
          <main
            id="main-content"
            className={`workspace-panels layout-${layout}`}
            style={{ "--split-ratio": `${ratio}%` } as import("react").CSSProperties}
          >
            {[0, ...(layout === "single" ? [] : [1])].map((target) => (
              <div
                key={`header-${target}`}
                className={`panel-heading ${panel === target ? "focused" : ""}`}
                style={{ gridArea: `head${target}` }}
                onPointerDown={() => setPanel(target)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  moveTab(event.dataTransfer.getData("text/research-tab"), target);
                }}
              >
                <div className="workspace-tabs no-print">
                  <nav
                    role="tablist"
                    aria-label={`Panel ${target + 1} tabs`}
                    onKeyDown={(event) => {
                      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                      const visible = tabs.filter(
                        (tab) =>
                          tab.projectId === data.activeProjectId && (tab.panel ?? 0) === target,
                      );
                      const index = visible.findIndex((tab) => tab.id === activeTabs[target]);
                      const next =
                        event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? visible.length - 1
                            : (index + (event.key === "ArrowRight" ? 1 : -1) + visible.length) %
                              visible.length;
                      if (visible[next]) {
                        event.preventDefault();
                        setActiveTab(visible[next].id, target);
                        (
                          event.currentTarget.querySelectorAll('[role="tab"]')[next] as HTMLElement
                        )?.focus();
                      }
                    }}
                  >
                    {tabs
                      .filter(
                        (tab) =>
                          tab.projectId === data.activeProjectId && (tab.panel ?? 0) === target,
                      )
                      .map((tab) => (
                        <div
                          key={tab.id}
                          draggable
                          onDragStart={(event) =>
                            event.dataTransfer.setData("text/research-tab", tab.id)
                          }
                          className={`workspace-tab ${tab.id === activeTabs[target] ? "is-active" : ""}`}
                        >
                          <button
                            id={`tab-${tab.id}`}
                            role="tab"
                            tabIndex={tab.id === activeTabs[target] ? 0 : -1}
                            aria-selected={tab.id === activeTabs[target]}
                            aria-controls={`pane-${tab.id}`}
                            onClick={() => {
                              setPanel(target);
                              setActiveTab(tab.id, target);
                              if (tab.documentId) setActiveDocumentId(tab.documentId);
                            }}
                            title={tabTitle(tab)}
                          >
                            <FileText size={13} />
                            <span>{tabTitle(tab)}</span>
                          </button>
                          <button
                            className="tab-close"
                            aria-label={`Close ${tabTitle(tab)}`}
                            onClick={() => closeTab(tab.id)}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                  </nav>
                  <button
                    className="icon-button"
                    title="New tab"
                    aria-label="New workspace tab"
                    onClick={() => newTab(target)}
                  >
                    <Plus size={16} />
                  </button>
                  <div className="split-control">
                    <button
                      className="icon-button"
                      title="Split workspace"
                      aria-label={`Split workspace panel ${target + 1}`}
                      aria-expanded={splitMenu === target}
                      onClick={() => setSplitMenu(splitMenu === target ? null : target)}
                    >
                      <Columns2 size={17} />
                    </button>
                    {splitMenu === target && (
                      <>
                        <button
                          className="split-menu-dismiss"
                          aria-label="Dismiss split menu"
                          onClick={() => setSplitMenu(null)}
                        />
                        <div
                          className="split-menu"
                          onKeyDown={(event) => {
                            if (event.key === "Escape") setSplitMenu(null);
                          }}
                        >
                          <button onClick={() => split("right", target)}>Split Right</button>
                          <button onClick={() => split("down", target)}>Split Down</button>
                          <button
                            disabled={layout === "single" || !activeTabs[target]}
                            onClick={() => {
                              moveTab(activeTabs[target], 1 - target);
                              setSplitMenu(null);
                            }}
                          >
                            Move Tab to Other Panel
                          </button>
                          <button disabled={layout === "single"} onClick={() => closeSplit(target)}>
                            Close Split
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
                {tabs.some((tab) => tab.id === activeTabs[target] && tab.section !== "empty") && (
                  <div className="workspace-breadcrumb">
                    <div>
                      <span>{project?.name}</span>
                      <strong>
                        {tabTitle(tabs.find((tab) => tab.id === activeTabs[target])!)}
                      </strong>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {layout !== "single" && (
              <div
                className="split-divider"
                style={{ gridArea: "divider" }}
                role="separator"
                tabIndex={0}
                aria-label="Resize workspace panels"
                aria-orientation={layout === "right" ? "vertical" : "horizontal"}
                aria-valuemin={20}
                aria-valuemax={80}
                aria-valuenow={Math.round(ratio)}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  event.preventDefault();
                }}
                onPointerMove={(event) => {
                  if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
                  const bounds = event.currentTarget.parentElement!.getBoundingClientRect();
                  setRatio(
                    clampPanelRatio(
                      (layout === "right"
                        ? (event.clientX - bounds.left) / bounds.width
                        : (event.clientY - bounds.top) / bounds.height) * 100,
                    ),
                  );
                }}
                onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                onKeyDown={(event) => {
                  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
                    event.preventDefault();
                    setRatio((value) =>
                      clampPanelRatio(
                        value + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -2 : 2),
                      ),
                    );
                  }
                }}
              />
            )}
            {isWorkspaceRoute &&
              tabs
                .filter((tab) => tab.projectId === data.activeProjectId)
                .map((tab) => {
                  const target = tab.panel ?? 0;
                  const View = views[tab.section as Section];
                  return (
                    <div
                      id={`pane-${tab.id}`}
                      role="tabpanel"
                      aria-labelledby={`tab-${tab.id}`}
                      key={tab.id}
                      hidden={
                        tab.id !== activeTabs[target] || (target === 1 && layout === "single")
                      }
                      className={`workspace-content ${tab.section === "empty" ? "new-tab-content" : ""}`}
                      style={{ gridArea: `body${target}` }}
                      onFocusCapture={() => setPanel(target)}
                      onPointerDown={() => {
                        setPanel(target);
                        if (tab.documentId) setActiveDocumentId(tab.documentId);
                      }}
                    >
                      <WorkspaceItemScope projectId={tab.contentProjectId}>
                        <Suspense
                          fallback={<p className="text-sm text-muted">Opening research view…</p>}
                        >
                          {tab.section === "empty" ? (
                            <NewTab />
                          ) : tab.section === "reader" ? (
                            <ReaderView passageId={tab.passageId} documentId={tab.documentId} />
                          ) : tab.section === "graph" ? (
                            <KnowledgeGraph
                              mode={tab.graphMode || "project"}
                              onModeChange={(graphMode) =>
                                setTabs((items) =>
                                  items.map((item) =>
                                    item.id === tab.id ? { ...item, graphMode } : item,
                                  ),
                                )
                              }
                              onOpen={(node, other) => {
                                const dest = other ? 1 - target : target;
                                if (other && layout === "single") {
                                  setLayout("right");
                                  setRatio(50);
                                }
                                const section = ["document", "annotation"].includes(node.type)
                                  ? "reader"
                                  : node.type === "note"
                                    ? "notes"
                                    : node.type === "concept"
                                      ? "roadmap"
                                      : ["claim", "finding"].includes(node.type)
                                        ? "evidence"
                                        : node.type === "draft"
                                          ? "writing"
                                          : "overview";
                                openTab(
                                  {
                                    id: `${node.projectId}:${section}:${node.sourceId}:${dest}`,
                                    section,
                                    projectId: data.activeProjectId,
                                    contentProjectId: node.projectId,
                                    itemId: node.sourceId,
                                    itemType: node.type,
                                    documentId:
                                      section === "reader"
                                        ? node.type === "annotation"
                                          ? node.references[0]?.documentId
                                          : node.sourceId
                                        : undefined,
                                    noteId: section === "notes" ? node.sourceId : undefined,
                                  },
                                  dest,
                                );
                                if (section === "reader")
                                  setActiveDocumentId(
                                    node.type === "annotation"
                                      ? node.references[0]?.documentId || ""
                                      : node.sourceId,
                                  );
                              }}
                            />
                          ) : tab.section === "roadmap" ? (
                            <RoadmapView conceptId={tab.itemId} />
                          ) : tab.section === "evidence" ? (
                            <EvidenceView
                              findingId={tab.itemType === "finding" ? tab.itemId : undefined}
                              claimId={tab.itemType === "claim" ? tab.itemId : undefined}
                            />
                          ) : tab.section === "notes" ? (
                            <NotesView noteId={tab.noteId} />
                          ) : (
                            <View />
                          )}
                        </Suspense>
                      </WorkspaceItemScope>
                    </div>
                  );
                })}
            {[0, ...(layout === "single" ? [] : [1])]
              .filter(
                (target) =>
                  !tabs.some(
                    (tab) =>
                      tab.id === activeTabs[target] && tab.projectId === data.activeProjectId,
                  ),
              )
              .map((target) => (
                <div
                  key={`empty-${target}`}
                  className="workspace-content new-tab-content"
                  style={{ gridArea: `body${target}` }}
                  onPointerDown={() => setPanel(target)}
                >
                  <NewTab />
                </div>
              ))}
          </main>
          <footer className="workspace-status no-print">
            {undoItem && (
              <button
                className="status-undo"
                disabled={trashBusy}
                onClick={() => void restoreItem(undoItem.id)}
              >
                Undo delete
              </button>
            )}
            {currentTab && currentTab.section !== "empty" && (
              <>
                <span>
                  <span className="status-dot" />
                  {project?.name}
                </span>
                <span>
                  {documents.length} sources ·{" "}
                  {data.notes.filter((item) => item.projectId === data.activeProjectId).length}{" "}
                  notes
                </span>
              </>
            )}
          </footer>
        </div>
        <aside className="assistant-dock no-print" hidden={!assistantOpen}>
          <AssistantPanel />
        </aside>
        {notice && (
          <div
            className="no-print fixed bottom-28 left-4 z-[70] max-w-sm rounded-lg border border-[#363636] bg-[#1e1e1e] px-4 py-3 text-sm shadow-xl sm:right-32 sm:left-auto"
            role="status"
          >
            {notice}
            <button
              className="ml-3 text-neutral"
              aria-label="Dismiss notice"
              onClick={() => setNotice("")}
            >
              <X size={14} />
            </button>
          </div>
        )}
        {explorerMenu && (
          <ExplorerContextMenu
            menu={explorerMenu}
            onClose={closeExplorerMenu}
            onOpen={() => void openExplorerItem(explorerMenu.target)}
            onCopyCitation={
              explorerMenu.target.kind === "source"
                ? () => {
                    const source = data.documents.find(
                      (item) => item.id === explorerMenu.target.id,
                    );
                    setExplorerMenu(null);
                    if (!source) return;
                    copyText(toBibtex(source))
                      .then(() => setNotice("BibTeX citation copied."))
                      .catch((error: Error) => setNotice(error.message));
                  }
                : undefined
            }
            onDelete={() => {
              const target = explorerMenu.target;
              setExplorerMenu(null);
              setTrashError("");
              if (target.kind === "project" || target.kind === "folder") setConfirmTrash(target);
              else void moveToTrash(target);
            }}
          />
        )}
        {confirmTrash && (
          <ConfirmTrash
            target={confirmTrash}
            busy={trashBusy}
            error={trashError}
            onClose={() => setConfirmTrash(null)}
            onConfirm={() => void moveToTrash(confirmTrash)}
          />
        )}
        {trashOpen && (
          <TrashDialog
            items={data.trash ?? []}
            busy={trashBusy}
            error={trashError}
            onClose={() => setTrashOpen(false)}
            onRestore={(id) => void restoreItem(id)}
          />
        )}
        {creating && (
          <div
            className="no-print fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Create project"
          >
            <form
              className="surface w-full max-w-md rounded-xl p-6"
              onSubmit={(event) => {
                event.preventDefault();
                void createProject();
              }}
            >
              <h2 className="text-xl font-semibold">Create a project</h2>
              <p className="mt-2 text-sm text-muted">
                Start a separate research space. Add sources from the library.
              </p>
              <label className="mt-5 block text-xs text-muted">
                Project name
                <input
                  className="input mt-2"
                  autoFocus
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  required
                />
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button type="button" className="btn" onClick={() => setCreating(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" type="submit">
                  Create project
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </KnowledgeProvider>
  );
}
