import { describe, expect, it } from "vitest";
import {
  initialWorkspace,
  restoreWorkspace,
  workspaceReducer,
  type WorkspaceState,
} from "./workspace-state";

const entries = (state: WorkspaceState) =>
  state.panes.map((pane) => pane.tabs.map((tab) => tab.entryId));
const active = (state: WorkspaceState) => {
  const pane = state.panes.find((candidate) => candidate.id === state.activePaneId)!;
  return pane.tabs.find((tab) => tab.id === pane.activeTabId)!.entryId;
};

describe("workspaceReducer", () => {
  it("opens into the empty tab, then replaces the current tab", () => {
    let state = workspaceReducer(initialWorkspace(), { type: "open", entryId: "a" });
    state = workspaceReducer(state, { type: "open", entryId: "b" });
    expect(entries(state)).toEqual([["b"]]);
  });

  it("opens new tabs beside the current one and focuses already-open entries", () => {
    let state = workspaceReducer(initialWorkspace(), { type: "open", entryId: "a" });
    state = workspaceReducer(state, { type: "open", entryId: "b", newTab: true });
    state = workspaceReducer(state, { type: "open", entryId: "a" });
    expect(entries(state)).toEqual([["a", "b"]]);
    expect(active(state)).toBe("a");
  });

  it("splits to the right and closes the split when its last tab closes", () => {
    let state = workspaceReducer(initialWorkspace(), { type: "open", entryId: "paper" });
    state = workspaceReducer(state, { type: "open", entryId: "chat", split: true });
    expect(entries(state)).toEqual([["paper"], ["chat"]]);
    expect(active(state)).toBe("chat");

    // Splitting from the paper again uses the existing right pane; there are never more than two.
    state = workspaceReducer(state, { type: "focus-pane", paneId: state.panes[0].id });
    state = workspaceReducer(state, { type: "open", entryId: "chat-2", split: true });
    expect(entries(state)).toEqual([["paper"], ["chat", "chat-2"]]);

    const right = state.panes[1];
    for (const tab of right.tabs)
      state = workspaceReducer(state, { type: "close", paneId: right.id, tabId: tab.id });
    expect(entries(state)).toEqual([["paper"]]);
    expect(active(state)).toBe("paper");
  });

  it("forgets deleted entries and keeps one empty tab at minimum", () => {
    let state = workspaceReducer(initialWorkspace(), { type: "open", entryId: "a" });
    state = workspaceReducer(state, { type: "forget", entryIds: ["a"] });
    expect(entries(state)).toEqual([[null]]);
  });
});

describe("restoreWorkspace", () => {
  it("drops tabs for entries that no longer exist", () => {
    let state = workspaceReducer(initialWorkspace(), { type: "open", entryId: "kept" });
    state = workspaceReducer(state, { type: "open", entryId: "gone", newTab: true });
    expect(entries(restoreWorkspace(state, new Set(["kept"]))!)).toEqual([["kept"]]);
    expect(restoreWorkspace({ nonsense: true }, new Set())).toBeNull();
  });
});
