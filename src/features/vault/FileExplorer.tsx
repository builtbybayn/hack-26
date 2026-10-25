"use client";

import {
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  ArrowUpNarrowWide,
  ChevronRight,
  ChevronsDownUp,
  FileText,
  FileUp,
  FolderPlus,
  MessageSquare,
  SquarePen,
} from "lucide-react";
import type { VaultEntry } from "@/types/vault";
import { ContextMenu, type MenuSection } from "./ContextMenu";
import { buildTree, canMove, SORT_LABELS, type SortOrder, type TreeNode } from "./vault-tree";

interface FileExplorerProps {
  entries: VaultEntry[];
  activeEntryId: string | null;
  selectedId: string | null;
  collapsed: Set<string>;
  sortOrder: SortOrder;
  running: Set<string>;
  onSelect: (id: string | null) => void;
  onOpen: (entry: VaultEntry, newTab: boolean) => void;
  onToggleFolder: (id: string) => void;
  onCollapseAll: () => void;
  onSortOrder: (order: SortOrder) => void;
  onNewNote: (parentId: string | null) => void;
  onNewFolder: (parentId: string | null) => void;
  onImport: (parentId: string | null) => void;
  /** Files dragged in from the desktop. */
  onDropFiles: (files: File[], parentId: string | null) => void;
  onRename: (entry: VaultEntry, name: string) => void;
  onMove: (entry: VaultEntry, parentId: string | null) => void;
  onDelete: (entry: VaultEntry) => void;
  onToggleBookmark: (entry: VaultEntry) => void;
  onOpenToRight: (entry: VaultEntry) => void;
  onNewChat: (entry: VaultEntry) => void;
  renamingId: string | null;
  onRenamingChange: (id: string | null) => void;
}

/** Obsidian's file explorer: folders, notes, papers, and chats, with drag-to-move and renaming. */
export function FileExplorer(props: FileExplorerProps) {
  const { entries, sortOrder } = props;
  const [menu, setMenu] = useState<{ x: number; y: number; sections: MenuSection[] } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null | undefined>(undefined);
  const tree = buildTree(entries, sortOrder);
  const targetFor = (entry: VaultEntry | null) =>
    entry ? (entry.kind === "folder" ? entry.id : entry.parentId) : null;

  const openMenu = (event: ReactMouseEvent, entry: VaultEntry | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (entry) props.onSelect(entry.id);
    const parent = targetFor(entry);
    const create: MenuSection = [
      { label: "New note", onSelect: () => props.onNewNote(parent) },
      { label: "New folder", onSelect: () => props.onNewFolder(parent) },
      { label: "Import paper…", onSelect: () => props.onImport(parent) },
    ];
    if (!entry) {
      setMenu({ x: event.clientX, y: event.clientY, sections: [create] });
      return;
    }
    const sections: MenuSection[] = [
      entry.kind === "folder"
        ? create
        : [
            { label: "Open in new tab", onSelect: () => props.onOpen(entry, true) },
            { label: "Open to the right", onSelect: () => props.onOpenToRight(entry) },
            ...(entry.kind === "paper"
              ? [{ label: "Chat about this paper", onSelect: () => props.onNewChat(entry) }]
              : []),
          ],
      [
        {
          label: entry.bookmarked ? "Remove bookmark" : "Bookmark",
          onSelect: () => props.onToggleBookmark(entry),
        },
        { label: "Rename…", onSelect: () => props.onRenamingChange(entry.id) },
      ],
      [
        {
          label: entry.kind === "folder" ? "Delete folder" : "Delete",
          warning: true,
          onSelect: () => props.onDelete(entry),
        },
      ],
    ];
    setMenu({ x: event.clientX, y: event.clientY, sections });
  };

  const sortMenu = (event: ReactMouseEvent) => {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({
      x: box.left,
      y: box.bottom + 4,
      sections: [
        (Object.keys(SORT_LABELS) as SortOrder[]).map((order) => ({
          label: `${order === sortOrder ? "✓ " : " "}${SORT_LABELS[order]}`,
          onSelect: () => props.onSortOrder(order),
        })),
      ],
    });
  };

  const onDrop = (event: DragEvent, folderId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(undefined);
    // Files from the desktop are imported; tree items are moved.
    if (event.dataTransfer.files.length) {
      props.onDropFiles([...event.dataTransfer.files], folderId);
      return;
    }
    const id = event.dataTransfer.getData("application/x-vault-entry");
    const entry = entries.find((candidate) => candidate.id === id);
    if (entry && canMove(entries, entry.id, folderId)) props.onMove(entry, folderId);
  };

  const dragOver = (event: DragEvent, folderId: string | null) => {
    event.preventDefault();
    event.stopPropagation();
    if (dropTarget !== folderId) setDropTarget(folderId);
  };

  return (
    <div className="file-explorer">
      <div className="nav-buttons-container">
        <button
          type="button"
          className="clickable-icon"
          aria-label="New note"
          title="New note"
          onClick={() => props.onNewNote(selectedFolder(entries, props.selectedId))}
        >
          <SquarePen size={18} />
        </button>
        <button
          type="button"
          className="clickable-icon"
          aria-label="New folder"
          title="New folder"
          onClick={() => props.onNewFolder(selectedFolder(entries, props.selectedId))}
        >
          <FolderPlus size={18} />
        </button>
        <button
          type="button"
          className="clickable-icon"
          aria-label="Import paper"
          title="Import paper (PDF)"
          onClick={() => props.onImport(selectedFolder(entries, props.selectedId))}
        >
          <FileUp size={18} />
        </button>
        <button
          type="button"
          className="clickable-icon"
          aria-label="Change sort order"
          title="Change sort order"
          onClick={sortMenu}
        >
          <ArrowUpNarrowWide size={18} />
        </button>
        <button
          type="button"
          className="clickable-icon"
          aria-label="Collapse all"
          title="Collapse all"
          onClick={props.onCollapseAll}
        >
          <ChevronsDownUp size={18} />
        </button>
      </div>
      <div
        className="nav-files-container"
        role="tree"
        aria-label="Files"
        data-drop={dropTarget === null || undefined}
        onContextMenu={(event) => openMenu(event, null)}
        onClick={(event) => {
          if (event.target === event.currentTarget) props.onSelect(null);
        }}
        onDragOver={(event) => dragOver(event, null)}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(undefined);
        }}
        onDrop={(event) => onDrop(event, null)}
      >
        {tree.length === 0 && (
          <p className="nav-empty">
            Your vault is empty. Import a paper or create a note to get started.
          </p>
        )}
        {tree.map((node) => (
          <TreeItem
            key={node.entry.id}
            node={node}
            depth={0}
            explorer={props}
            dropTarget={dropTarget}
            onContextMenu={openMenu}
            onDragOverFolder={dragOver}
            onDropFolder={onDrop}
          />
        ))}
      </div>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} sections={menu.sections} onClose={() => setMenu(null)} />
      )}
    </div>
  );
}

function selectedFolder(entries: VaultEntry[], selectedId: string | null): string | null {
  const selected = entries.find((entry) => entry.id === selectedId);
  if (!selected) return null;
  return selected.kind === "folder" ? selected.id : selected.parentId;
}

function TreeItem({
  node,
  depth,
  explorer,
  dropTarget,
  onContextMenu,
  onDragOverFolder,
  onDropFolder,
}: {
  node: TreeNode;
  depth: number;
  explorer: FileExplorerProps;
  dropTarget: string | null | undefined;
  onContextMenu: (event: ReactMouseEvent, entry: VaultEntry) => void;
  onDragOverFolder: (event: DragEvent, folderId: string | null) => void;
  onDropFolder: (event: DragEvent, folderId: string | null) => void;
}) {
  const { entry } = node;
  const isFolder = entry.kind === "folder";
  const open = isFolder && !explorer.collapsed.has(entry.id);
  const renaming = explorer.renamingId === entry.id;
  const folderForDrop = isFolder ? entry.id : entry.parentId;
  const analyzing = entry.kind === "paper" && explorer.running.has(entry.documentId);

  const activate = (event: ReactMouseEvent | ReactKeyboardEvent) => {
    explorer.onSelect(entry.id);
    if (isFolder) explorer.onToggleFolder(entry.id);
    else explorer.onOpen(entry, event.ctrlKey || event.metaKey);
  };

  return (
    <div
      className="tree-item"
      role="treeitem"
      aria-expanded={isFolder ? open : undefined}
      aria-selected={explorer.selectedId === entry.id}
    >
      <div
        className="tree-item-self"
        data-kind={entry.kind}
        data-active={(!isFolder && explorer.activeEntryId === entry.id) || undefined}
        data-selected={explorer.selectedId === entry.id || undefined}
        data-drop={(isFolder && dropTarget === entry.id) || undefined}
        style={{ paddingInlineStart: 8 + depth * 17 + (isFolder ? 0 : 8) }}
        tabIndex={0}
        draggable={!renaming}
        onDragStart={(event) => {
          event.dataTransfer.setData("application/x-vault-entry", entry.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onDragOver={(event) => onDragOverFolder(event, folderForDrop)}
        onDrop={(event) => onDropFolder(event, folderForDrop)}
        onClick={activate}
        onAuxClick={(event) => {
          if (event.button === 1 && !isFolder) explorer.onOpen(entry, true);
        }}
        onContextMenu={(event) => onContextMenu(event, entry)}
        onKeyDown={(event) => {
          if (renaming) return;
          if (event.key === "Enter") activate(event);
          if (event.key === "F2") explorer.onRenamingChange(entry.id);
          if (event.key === "Delete") explorer.onDelete(entry);
          if (isFolder && event.key === "ArrowRight" && !open) explorer.onToggleFolder(entry.id);
          if (isFolder && event.key === "ArrowLeft" && open) explorer.onToggleFolder(entry.id);
        }}
      >
        {isFolder ? (
          <ChevronRight
            size={14}
            className="tree-item-icon collapse-icon"
            data-open={open || undefined}
            aria-hidden
          />
        ) : null}
        {entry.kind === "chat" && (
          <MessageSquare size={14} className="tree-item-kind" aria-hidden />
        )}
        {entry.kind === "paper" && <FileText size={14} className="tree-item-kind" aria-hidden />}
        {renaming ? (
          <RenameInput
            initial={entry.name}
            onDone={(name) => {
              if (name !== null) explorer.onRename(entry, name);
              explorer.onRenamingChange(null);
            }}
          />
        ) : (
          <span className="tree-item-inner">{entry.name}</span>
        )}
        {analyzing && <span className="tree-item-flair" title="Analyzing" aria-label="Analyzing" />}
      </div>
      {open && node.children.length > 0 && (
        <div className="tree-item-children" role="group">
          {node.children.map((child) => (
            <TreeItem
              key={child.entry.id}
              node={child}
              depth={depth + 1}
              explorer={explorer}
              dropTarget={dropTarget}
              onContextMenu={onContextMenu}
              onDragOverFolder={onDragOverFolder}
              onDropFolder={onDropFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RenameInput({
  initial,
  onDone,
}: {
  initial: string;
  onDone: (name: string | null) => void;
}) {
  const [value, setValue] = useState(initial);
  const finished = useRef(false);
  const finish = (name: string | null) => {
    if (finished.current) return;
    finished.current = true;
    onDone(name);
  };
  return (
    <input
      className="tree-rename"
      aria-label="New name"
      autoFocus
      value={value}
      onFocus={(event) => event.target.select()}
      onChange={(event) => setValue(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(value);
        if (event.key === "Escape") finish(null);
      }}
    />
  );
}
