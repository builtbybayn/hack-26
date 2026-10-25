import type { Section } from "./models";

export interface WorkspaceTab {
  id: string;
  section: Section | "empty";
  projectId: string;
  contentProjectId?: string;
  documentId?: string;
  passageId?: string;
  noteId?: string;
  itemId?: string;
  itemType?: string;
  panel?: number;
  graphMode?: "project" | "brain";
}

// Panel membership is separate from content identity, so moves never remount views.
export function transferTab(
  tabs: WorkspaceTab[],
  active: string[],
  id: string,
  target: number,
  projectId: string,
) {
  const tab = tabs.find((item) => item.id === id);
  if (!tab || (tab.panel ?? 0) === target) return { tabs, active };
  const source = tab.panel ?? 0;
  return {
    tabs: tabs.map((item) => (item.id === id ? { ...item, panel: target } : item)),
    active: active.map((value, index) =>
      index === target
        ? id
        : value === id
          ? tabs
              .filter(
                (item) =>
                  item.id !== id && (item.panel ?? 0) === source && item.projectId === projectId,
              )
              .at(-1)?.id || ""
          : value,
    ),
  };
}

export function mergePanels(tabs: WorkspaceTab[], active: string[], closed: number) {
  return {
    tabs: tabs.map((item) => ({ ...item, panel: 0 })),
    active: [active[1 - closed] || active[closed], ""],
  };
}

export function clampPanelRatio(value: number) {
  return Math.max(20, Math.min(80, value));
}
