import {
  ChevronRight,
  Folder,
  FolderOpen,
  Waypoints,
  BookOpenText,
  FolderKanban,
  NotebookPen,
  FilePenLine,
  Network,
  LibraryBig,
  PanelsTopLeft,
  ShieldCheck,
  Newspaper,
} from "lucide-react";
import type { ReactNode, MouseEventHandler } from "react";

/**
 * Every workspace section (for routing and tab titles). `rail` marks the few shown in the left
 * rail; the rest open from context: the reader from a source, roadmap and evidence from the
 * project overview.
 */
export const navigation = [
  { id: "overview", label: "Overview", icon: FolderKanban, rail: true },
  { id: "news", label: "News", icon: Newspaper, rail: true },
  { id: "library", label: "Library", icon: LibraryBig, rail: true },
  { id: "notes", label: "Notes", icon: NotebookPen, rail: true },
  { id: "writing", label: "Writing", icon: FilePenLine, rail: true },
  { id: "graph", label: "Graph", icon: Waypoints, rail: true },
  { id: "reader", label: "Reader", icon: BookOpenText, rail: false },
  { id: "roadmap", label: "Roadmap", icon: Network, rail: false },
  { id: "evidence", label: "Evidence", icon: ShieldCheck, rail: false },
  { id: "extension", label: "Extension", icon: PanelsTopLeft, rail: false },
] as const;

export function ExplorerGroup({
  title,
  count,
  children,
  onContextMenu,
  action,
}: {
  title: string;
  count?: number;
  children: ReactNode;
  onContextMenu?: MouseEventHandler<HTMLElement>;
  /** A small control on the heading, e.g. "+" to add. */
  action?: ReactNode;
}) {
  return (
    <details className="explorer-group" open>
      <summary onContextMenu={onContextMenu}>
        {title}
        {action}
        {count !== undefined && <span>{count}</span>}
      </summary>
      {children}
    </details>
  );
}

/**
 * An Obsidian-style folder in the explorer: the whole row toggles it, and its icon shows whether
 * it is open. `open` is controlled so the explorer remembers which folders are expanded.
 */
export function TreeFolder({
  label,
  open,
  onToggle,
  action,
  onContextMenu,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  action?: ReactNode;
  onContextMenu?: MouseEventHandler<HTMLElement>;
  children: ReactNode;
}) {
  return (
    <details className="tree-folder" open={open}>
      <summary
        className="tree-row"
        onContextMenu={onContextMenu}
        onClick={(event) => {
          // The row's own controls ("+") work without toggling the folder.
          if ((event.target as HTMLElement).closest("a, button")) return;
          event.preventDefault();
          onToggle();
        }}
      >
        <ChevronRight size={12} className="tree-chevron" aria-hidden />
        {open ? <FolderOpen size={14} aria-hidden /> : <Folder size={14} aria-hidden />}
        <span>{label}</span>
        {action}
      </summary>
      <div className="tree-children">{children}</div>
    </details>
  );
}
