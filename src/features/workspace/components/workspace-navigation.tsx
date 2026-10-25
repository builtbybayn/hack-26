import {
  Waypoints,
  BookOpenText,
  FolderKanban,
  NotebookPen,
  FilePenLine,
  Network,
  LibraryBig,
  PanelsTopLeft,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";

export const navigation = [
  { id: "graph", label: "Knowledge Graph", icon: Waypoints },
  { id: "overview", label: "Overview", icon: FolderKanban },
  { id: "library", label: "Research library", icon: LibraryBig },
  { id: "reader", label: "Document reader", icon: BookOpenText },
  { id: "roadmap", label: "Knowledge roadmap", icon: Network },
  { id: "evidence", label: "Assumptions & evidence", icon: ShieldCheck },
  { id: "notes", label: "Notes & questions", icon: NotebookPen },
  { id: "writing", label: "Writing workspace", icon: FilePenLine },
  { id: "extension", label: "Browser companion", icon: PanelsTopLeft },
] as const;

export function ExplorerGroup({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  return (
    <details className="explorer-group" open>
      <summary>
        {title}
        {count !== undefined && <span>{count}</span>}
      </summary>
      {children}
    </details>
  );
}
