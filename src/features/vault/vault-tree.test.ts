import { describe, expect, it } from "vitest";
import type { DocumentRecord } from "@/lib/browser-store";
import type { VaultEntry } from "@/types/vault";
import {
  buildTree,
  canMove,
  collectDescendants,
  findByName,
  folderPath,
  newProjectEntries,
  placeUnfiledPapers,
  uniqueName,
} from "./vault-tree";

const at = "2026-10-24T00:00:00.000Z";
const folder = (id: string, parentId: string | null = null, name = id): VaultEntry => ({
  id,
  kind: "folder",
  name,
  parentId,
  createdAt: at,
  updatedAt: at,
});
const note = (id: string, parentId: string | null, updatedAt = at): VaultEntry => ({
  id,
  kind: "note",
  name: id,
  parentId,
  body: "",
  createdAt: at,
  updatedAt,
});
const record = (id: string, title?: string) =>
  ({ id, document: { title, source: { fileName: `${id}.pdf` } } }) as unknown as DocumentRecord;

describe("buildTree", () => {
  it("nests entries with folders first and sorts by name", () => {
    const tree = buildTree([
      note("b-note", null),
      folder("topic"),
      note("a-note", null),
      note("inner", "topic"),
    ]);
    expect(tree.map((node) => node.entry.id)).toEqual(["topic", "a-note", "b-note"]);
    expect(tree[0].children.map((node) => node.entry.id)).toEqual(["inner"]);
  });

  it("sorts by modified time and shows orphans at the root", () => {
    const tree = buildTree(
      [
        note("old", null, "2026-01-01"),
        note("new", null, "2026-06-01"),
        note("lost", "gone", "2025-01-01"),
      ],
      "modified-new",
    );
    expect(tree.map((node) => node.entry.id)).toEqual(["new", "old", "lost"]);
  });
});

describe("placeUnfiledPapers", () => {
  it("creates a Papers folder when there is no project yet", () => {
    const added = placeUnfiledPapers([], [record("p1", "Attention"), record("p2")]);
    expect(added[0]).toMatchObject({ kind: "folder", name: "Papers", parentId: null });
    expect(added.slice(1)).toMatchObject([
      { kind: "paper", name: "Attention", documentId: "p1", parentId: added[0].id },
      { kind: "paper", name: "p2", documentId: "p2" },
    ]);
  });

  it("files papers in the first project's Papers folder", () => {
    const entries: VaultEntry[] = [
      folder("chats", null, "Chats"),
      folder("topic2", null, "Topic2"),
      folder("topic1", null, "Topic1"),
      folder("t1-papers", "topic1", "papers"),
      folder("t2-papers", "topic2", "Papers"),
    ];
    const added = placeUnfiledPapers(entries, [record("p1")]);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ documentId: "p1", parentId: "t1-papers" });
  });

  it("creates the Papers folder inside the first project when missing, once", () => {
    const added = placeUnfiledPapers(
      [folder("topic1", null, "Topic1")],
      [record("a"), record("b")],
    );
    expect(added[0]).toMatchObject({ kind: "folder", name: "Papers", parentId: "topic1" });
    expect(added.filter((entry) => entry.kind === "folder")).toHaveLength(1);
  });

  it("skips papers already placed", () => {
    const entries: VaultEntry[] = [
      folder("papers", null, "Papers"),
      { ...note("x", null), kind: "paper", documentId: "p1" } as VaultEntry,
    ];
    const added = placeUnfiledPapers(entries, [record("p1"), record("p2")]);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ documentId: "p2", parentId: "papers" });
  });
});

describe("tree operations", () => {
  const entries = [folder("a"), folder("b", "a"), note("n", "b"), note("other", null)];

  it("collects a folder and everything inside it", () => {
    expect(collectDescendants(entries, "a").map((entry) => entry.id)).toEqual(["a", "b", "n"]);
  });

  it("refuses to move a folder into its own subfolder", () => {
    expect(canMove(entries, "a", "b")).toBe(false);
    expect(canMove(entries, "a", "a")).toBe(false);
    expect(canMove(entries, "b", null)).toBe(true);
    expect(canMove(entries, "n", "a")).toBe(true);
  });

  it("numbers duplicate names among siblings", () => {
    const siblings = [note("Untitled", null), note("Untitled 1", null)];
    expect(uniqueName(siblings, null, "Untitled")).toBe("Untitled 2");
    expect(uniqueName(siblings, "elsewhere", "Untitled")).toBe("Untitled");
  });

  it("finds wikilink targets by name and builds folder paths", () => {
    expect(findByName(entries, "N")?.id).toBe("n");
    expect(findByName(entries, "a")).toBeNull(); // folders can't be linked
    expect(folderPath(entries, "n")).toEqual(["a", "b"]);
  });
});

describe("newProjectEntries", () => {
  it("creates the project with Notes/Roadmap and Papers, named uniquely", () => {
    const { project, roadmap, created } = newProjectEntries(
      [folder("existing", null, "Quantum RL")],
      "Quantum RL",
      "# Roadmap",
    );
    expect(project).toMatchObject({ name: "Quantum RL 1", parentId: null });
    expect(created.map((entry) => `${entry.kind}:${entry.name}`)).toEqual([
      "folder:Quantum RL 1",
      "folder:Notes",
      "folder:Papers",
      "note:Roadmap",
    ]);
    expect(roadmap.body).toBe("# Roadmap");
    expect(roadmap.parentId).toBe(created[1].id);
  });
});
