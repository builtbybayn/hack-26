import { describe, expect, it } from "vitest";
import { clampPanelRatio, mergePanels, transferTab, type WorkspaceTab } from "./workspace-panels";

describe("split workspace panels", () => {
  const tabs: WorkspaceTab[] = [
    { id: "a", section: "notes", projectId: "project", panel: 0 },
    { id: "b", section: "writing", projectId: "project", panel: 0 },
    { id: "c", section: "reader", projectId: "project", panel: 1 },
  ];
  it("moves an active tab and selects a remaining tab in its old panel", () => {
    const moved = transferTab(tabs, ["b", "c"], "b", 1, "project");
    expect(moved.active).toEqual(["a", "b"]);
    expect(moved.tabs.find((tab) => tab.id === "b")?.panel).toBe(1);
    expect(tabs[1].panel).toBe(0);
  });
  it("retains the surviving panel's selection when merging", () => {
    const merged = mergePanels(tabs, ["b", "c"], 0);
    expect(merged.active).toEqual(["c", ""]);
    expect(merged.tabs.every((tab) => tab.panel === 0)).toBe(true);
  });
  it("keeps both panels usable at the resize limits", () => {
    expect(clampPanelRatio(-10)).toBe(20);
    expect(clampPanelRatio(120)).toBe(80);
    expect(clampPanelRatio(45)).toBe(45);
  });
});
