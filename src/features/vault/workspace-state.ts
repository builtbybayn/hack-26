/**
 * Which tabs are open where. Like Obsidian, the work area has tabs and can be split in two, e.g.
 * a paper on the left and a chat about it on the right. Pure reducer, saved per browser.
 */

export interface WorkspaceTab {
  id: string;
  /** The vault entry shown, or null for an empty "New tab". */
  entryId: string | null;
}

export interface WorkspacePane {
  id: string;
  tabs: WorkspaceTab[];
  activeTabId: string;
}

export interface WorkspaceState {
  panes: WorkspacePane[];
  activePaneId: string;
}

export type WorkspaceAction =
  /** Opens an entry: focuses it if already open, else replaces the active tab (or adds one). */
  | { type: "open"; entryId: string; newTab?: boolean; split?: boolean }
  | { type: "activate"; paneId: string; tabId: string }
  | { type: "close"; paneId: string; tabId: string }
  | { type: "new-tab"; paneId: string }
  | { type: "focus-pane"; paneId: string }
  /** Entries were deleted: close their tabs. */
  | { type: "forget"; entryIds: string[] }
  | { type: "restore"; state: WorkspaceState };

const MAX_PANES = 2;

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

function emptyPane(): WorkspacePane {
  const tab = { id: id("tab"), entryId: null };
  return { id: id("pane"), tabs: [tab], activeTabId: tab.id };
}

/** Fixed IDs, so the server-rendered and first client render match. */
export function initialWorkspace(): WorkspaceState {
  return {
    panes: [
      {
        id: "pane-initial",
        tabs: [{ id: "tab-initial", entryId: null }],
        activeTabId: "tab-initial",
      },
    ],
    activePaneId: "pane-initial",
  };
}

export function workspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case "restore":
      return action.state;
    case "open": {
      if (!action.split) {
        for (const pane of state.panes) {
          const tab = pane.tabs.find((candidate) => candidate.entryId === action.entryId);
          if (tab) return activate(state, pane.id, tab.id);
        }
      }
      let panes = state.panes;
      let paneId = state.activePaneId;
      if (action.split) {
        const other = panes.find((pane) => pane.id !== state.activePaneId);
        if (other) paneId = other.id;
        else if (panes.length < MAX_PANES) {
          const pane = emptyPane();
          panes = [...panes, pane];
          paneId = pane.id;
        }
        const existing = panes
          .find((pane) => pane.id === paneId)!
          .tabs.find((tab) => tab.entryId === action.entryId);
        if (existing) return activate({ ...state, panes }, paneId, existing.id);
      }
      return {
        activePaneId: paneId,
        panes: panes.map((pane) => {
          if (pane.id !== paneId) return pane;
          const active = pane.tabs.find((tab) => tab.id === pane.activeTabId);
          // Reuse an empty tab, or the current one unless a new tab was asked for.
          if (active && (active.entryId === null || (!action.newTab && !action.split)))
            return {
              ...pane,
              tabs: pane.tabs.map((tab) =>
                tab.id === active.id ? { ...tab, entryId: action.entryId } : tab,
              ),
            };
          const tab = { id: id("tab"), entryId: action.entryId };
          const index = pane.tabs.findIndex((candidate) => candidate.id === pane.activeTabId);
          const tabs = [...pane.tabs];
          tabs.splice(index + 1, 0, tab);
          return { ...pane, tabs, activeTabId: tab.id };
        }),
      };
    }
    case "activate":
      return activate(state, action.paneId, action.tabId);
    case "focus-pane":
      return state.panes.some((pane) => pane.id === action.paneId)
        ? { ...state, activePaneId: action.paneId }
        : state;
    case "new-tab": {
      const tab = { id: id("tab"), entryId: null };
      return {
        activePaneId: action.paneId,
        panes: state.panes.map((pane) =>
          pane.id === action.paneId
            ? { ...pane, tabs: [...pane.tabs, tab], activeTabId: tab.id }
            : pane,
        ),
      };
    }
    case "close":
      return closeTabs(state, (pane, tab) => pane.id === action.paneId && tab.id === action.tabId);
    case "forget": {
      const forgotten = new Set(action.entryIds);
      return closeTabs(state, (_, tab) => tab.entryId !== null && forgotten.has(tab.entryId));
    }
  }
}

function activate(state: WorkspaceState, paneId: string, tabId: string): WorkspaceState {
  return {
    activePaneId: paneId,
    panes: state.panes.map((pane) => (pane.id === paneId ? { ...pane, activeTabId: tabId } : pane)),
  };
}

/** Closing a pane's last tab removes the pane, unless it's the only one left. */
function closeTabs(
  state: WorkspaceState,
  matches: (pane: WorkspacePane, tab: WorkspaceTab) => boolean,
): WorkspaceState {
  let panes = state.panes.map((pane) => {
    const tabs = pane.tabs.filter((tab) => !matches(pane, tab));
    if (tabs.length === pane.tabs.length) return pane;
    if (!tabs.length) return { ...pane, tabs };
    const closedIndex = pane.tabs.findIndex((tab) => tab.id === pane.activeTabId);
    const activeTabId = tabs.some((tab) => tab.id === pane.activeTabId)
      ? pane.activeTabId
      : tabs[Math.min(closedIndex, tabs.length - 1)].id;
    return { ...pane, tabs, activeTabId };
  });
  const remaining = panes.filter((pane) => pane.tabs.length);
  if (remaining.length) panes = remaining;
  else panes = [{ ...emptyPane(), id: panes[0].id }];
  const activePaneId = panes.some((pane) => pane.id === state.activePaneId)
    ? state.activePaneId
    : panes[0].id;
  return { panes, activePaneId };
}

/** Validates a saved workspace, dropping tabs whose entries no longer exist. */
export function restoreWorkspace(saved: unknown, entryIds: Set<string>): WorkspaceState | null {
  const state = saved as WorkspaceState | null;
  if (!state || !Array.isArray(state.panes) || !state.panes.length) return null;
  try {
    const pruned = workspaceReducer(state, {
      type: "forget",
      entryIds: state.panes
        .flatMap((pane) => pane.tabs.map((tab) => tab.entryId))
        .filter((entryId): entryId is string => entryId !== null && !entryIds.has(entryId)),
    });
    return pruned.panes.slice(0, MAX_PANES).every((pane) => pane.tabs.length) ? pruned : null;
  } catch {
    return null;
  }
}
