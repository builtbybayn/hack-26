import type { WorkspaceData } from "./models";
import type { WorkspaceTab } from "./workspace-panels";

export function routeWorkspaceTab(
  pathname: string,
  params: Pick<URLSearchParams, "get">,
  data: WorkspaceData,
  activeDocumentId = "",
): WorkspaceTab {
  const documentId = params.get("doc") || params.get("paper") || undefined;
  const noteId =
    params.get("note") ||
    (data.notes.some((note) => note.id === params.get("entry"))
      ? params.get("entry")
      : undefined) ||
    undefined;
  const section =
    pathname === "/"
      ? documentId
        ? "reader"
        : noteId
          ? "notes"
          : "empty"
      : (pathname.slice(1) as WorkspaceTab["section"]);
  const fallback =
    data.documents.find(
      (document) => document.id === activeDocumentId && document.projectId === data.activeProjectId,
    ) ||
    data.documents.find(
      (document) => document.projectId === data.activeProjectId && document.status === "ready",
    );
  const sourceId = documentId || (section === "reader" ? fallback?.id : undefined);
  const contentProjectId =
    data.documents.find((document) => document.id === sourceId)?.projectId ||
    data.notes.find((note) => note.id === noteId)?.projectId;
  const page = params.get("page");
  const graphMode = section === "graph" && params.get("mode") === "brain" ? "brain" : undefined;
  return {
    id: `${data.activeProjectId}:${section}:${sourceId || noteId || ""}${graphMode ? ":brain" : ""}`,
    section,
    graphMode,
    projectId: data.activeProjectId,
    contentProjectId,
    documentId: sourceId,
    noteId,
    passageId:
      params.get("passage") ||
      (page && /^\d+$/.test(page) && Number(page) > 0 ? `p${page}` : undefined),
  };
}
