import { describe, expect, it } from "vitest";
import type { VaultEntry } from "@/types/vault";
import {
  entriesToRestore,
  entriesToTrash,
  validateVaultWrite,
  visibleDocumentRecords,
} from "./vault-trash";

const at = "2026-10-25T12:00:00Z";
const base = { createdAt: at, updatedAt: at };
const tree: VaultEntry[] = [
  { ...base, id: "project", kind: "folder", parentId: null, name: "Research" },
  { ...base, id: "notes", kind: "folder", parentId: "project", name: "Notes" },
  { ...base, id: "note", kind: "note", parentId: "notes", name: "Idea", body: "Keep this content" },
  { ...base, id: "paper", kind: "paper", parentId: "project", name: "Source", documentId: "doc" },
  { ...base, id: "other", kind: "folder", parentId: null, name: "Other research" },
];
const merge = (entries: VaultEntry[], changes: VaultEntry[]) =>
  entries.map((entry) => changes.find((item) => item.id === entry.id) || entry);

describe("recoverable vault deletion", () => {
  it("moves an entire project subtree without modifying other projects or original contents", () => {
    const changes = entriesToTrash(tree, "project", at);
    expect(changes.map((entry) => entry.id)).toEqual(["project", "notes", "note", "paper"]);
    expect(
      changes.every((entry) => entry.trashRootId === "project" && entry.trashedAt === at),
    ).toBe(true);
    expect(changes.find((entry) => entry.kind === "note")).toMatchObject({
      body: "Keep this content",
    });
    expect(tree.every((entry) => !entry.trashedAt)).toBe(true);
  });
  it("restores the batch with all IDs, hierarchy, and source references intact", () => {
    const trashed = merge(tree, entriesToTrash(tree, "project", at));
    const restored = entriesToRestore(trashed, "project");
    expect(restored).toEqual(tree.filter((entry) => entry.id !== "other"));
  });
  it("keeps separately deleted notes in Trash when their project is restored", () => {
    const noteDeleted = merge(tree, entriesToTrash(tree, "note", at));
    const projectDeleted = merge(noteDeleted, entriesToTrash(noteDeleted, "project", at));
    expect(entriesToRestore(projectDeleted, "project").some((entry) => entry.id === "note")).toBe(
      false,
    );
    expect(() => entriesToRestore(projectDeleted, "note")).toThrow("containing folder");
    const projectRestored = merge(projectDeleted, entriesToRestore(projectDeleted, "project"));
    expect(entriesToRestore(projectRestored, "note")[0]).toMatchObject({
      id: "note",
      body: "Keep this content",
    });
  });
  it("gives restored roots a unique name when another item now occupies the old name", () => {
    const trashed = merge(tree, entriesToTrash(tree, "note", at));
    trashed.push({
      ...base,
      id: "replacement",
      kind: "note",
      parentId: "notes",
      name: "Idea",
      body: "New note",
    });
    expect(entriesToRestore(trashed, "note")[0].name).toBe("Idea 1");
  });
  it("hides a trashed paper from import discovery while preserving shared placements", () => {
    const records = [{ id: "doc" }, { id: "unfiled" }];
    const trashed = merge(tree, entriesToTrash(tree, "paper", at));
    expect(visibleDocumentRecords(records, trashed)).toEqual([{ id: "unfiled" }]);
    trashed.push({
      ...base,
      id: "shared",
      kind: "paper",
      parentId: "other",
      name: "Shared",
      documentId: "doc",
    });
    expect(visibleDocumentRecords(records, trashed)).toEqual(records);
  });
  it("rejects a late autosave and a new child written into a deleted folder", () => {
    const trashed = merge(tree, entriesToTrash(tree, "notes", at));
    expect(() => validateVaultWrite(trashed, [tree[2]])).toThrow("Trash");
    expect(() => validateVaultWrite(trashed, [{ ...tree[2], id: "new-note" }])).toThrow("Trash");
    expect(() => validateVaultWrite(trashed, [tree[4]])).not.toThrow();
  });
  it("does not delete a missing item or restore one that is already active", () => {
    expect(() => entriesToTrash(tree, "missing", at)).toThrow("no longer available");
    expect(() => entriesToRestore(tree, "note")).toThrow("no longer in Trash");
  });
});
