/** Pure helpers for the vault's file tree. No storage or React here, so they are easy to test. */
import type { DocumentRecord } from "@/lib/browser-store";
import type { VaultChat, VaultEntry, VaultFolder, VaultNote, VaultPaper } from "@/types/vault";

export type SortOrder = "name-asc" | "name-desc" | "modified-new" | "modified-old";

export const SORT_LABELS: Record<SortOrder, string> = {
  "name-asc": "File name (A to Z)",
  "name-desc": "File name (Z to A)",
  "modified-new": "Modified time (new to old)",
  "modified-old": "Modified time (old to new)",
};

/** The papers section of a project. */
export const PAPERS_FOLDER = "Papers";

export interface TreeNode {
  entry: VaultEntry;
  children: TreeNode[];
}

export function newId(): string {
  return crypto.randomUUID();
}

/** Folders first, then items, each in the chosen order. */
export function buildTree(entries: VaultEntry[], order: SortOrder = "name-asc"): TreeNode[] {
  const byParent = new Map<string | null, VaultEntry[]>();
  const ids = new Set(entries.map((entry) => entry.id));
  for (const entry of entries) {
    // An entry whose folder is gone shows at the root rather than disappearing.
    const parent = entry.parentId && ids.has(entry.parentId) ? entry.parentId : null;
    byParent.set(parent, [...(byParent.get(parent) ?? []), entry]);
  }
  const build = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .sort((a, b) => compareEntries(a, b, order))
      .map((entry) => ({
        entry,
        children: entry.kind === "folder" ? build(entry.id) : [],
      }));
  return build(null);
}

function compareEntries(a: VaultEntry, b: VaultEntry, order: SortOrder): number {
  const folderFirst = Number(b.kind === "folder") - Number(a.kind === "folder");
  if (folderFirst) return folderFirst;
  switch (order) {
    case "name-asc":
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    case "name-desc":
      return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: "base" });
    case "modified-new":
      return b.updatedAt.localeCompare(a.updatedAt);
    case "modified-old":
      return a.updatedAt.localeCompare(b.updatedAt);
  }
}

/** The display name of a paper: its title, or its file name without the extension. */
export function paperName(record: Pick<DocumentRecord, "document">): string {
  const { title, source } = record.document;
  return (title?.trim() || source.fileName.replace(/\.[a-z0-9]+$/i, "")).slice(0, 200);
}

/** Where chats are filed. */
export const CHATS_FOLDER = "Chats";

const sameName = (a: string, b: string) =>
  a.localeCompare(b, undefined, { sensitivity: "base" }) === 0;

/** The folder with this name (any case) in `parentId`, created if missing. */
export function ensureFolder(
  entries: VaultEntry[],
  parentId: string | null,
  name: string,
  now = new Date().toISOString(),
): { folderId: string; created: VaultFolder[] } {
  const existing = entries.find(
    (entry) => entry.kind === "folder" && entry.parentId === parentId && sameName(entry.name, name),
  );
  if (existing) return { folderId: existing.id, created: [] };
  const folder: VaultFolder = {
    id: newId(),
    kind: "folder",
    name,
    parentId,
    createdAt: now,
    updatedAt: now,
  };
  return { folderId: folder.id, created: [folder] };
}

/**
 * Where a paper goes when no folder was chosen (e.g. sent from the extension): the "Papers"
 * folder of the first project, meaning the first top-level folder A to Z other than "Papers" and
 * "Chats". "Papers" is created inside it if needed. With no project yet, a top-level "Papers".
 */
export function defaultPaperFolder(
  entries: VaultEntry[],
  now = new Date().toISOString(),
): { folderId: string; created: VaultFolder[] } {
  const [project] = entries
    .filter(
      (entry) =>
        entry.kind === "folder" &&
        entry.parentId === null &&
        !sameName(entry.name, PAPERS_FOLDER) &&
        !sameName(entry.name, CHATS_FOLDER),
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );
  return ensureFolder(entries, project?.id ?? null, PAPERS_FOLDER, now);
}

/**
 * A new research project: a top-level folder with "Notes" (holding the roadmap note) and "Papers".
 */
export function newProjectEntries(
  entries: VaultEntry[],
  projectName: string,
  roadmapBody: string,
  now = new Date().toISOString(),
): { project: VaultFolder; roadmap: VaultNote; created: VaultEntry[] } {
  const folder = (name: string, parentId: string | null): VaultFolder => ({
    id: newId(),
    kind: "folder",
    name,
    parentId,
    createdAt: now,
    updatedAt: now,
  });
  const project = folder(uniqueName(entries, null, projectName.trim() || "New project"), null);
  const notes = folder("Notes", project.id);
  const papers = folder(PAPERS_FOLDER, project.id);
  const roadmap: VaultNote = {
    id: newId(),
    kind: "note",
    name: "Roadmap",
    parentId: notes.id,
    body: roadmapBody,
    createdAt: now,
    updatedAt: now,
  };
  return { project, roadmap, created: [project, notes, papers, roadmap] };
}

/** A new, empty chat filed in "Chats" (plus the folder, if it had to be created). */
export function newChatEntries(
  entries: VaultEntry[],
  documentIds: string[],
  baseName: string,
  now = new Date().toISOString(),
): { chat: VaultChat; created: VaultFolder[] } {
  const { folderId, created } = ensureFolder(entries, null, CHATS_FOLDER, now);
  const chat: VaultChat = {
    id: newId(),
    kind: "chat",
    name: uniqueName([...entries, ...created], folderId, baseName),
    parentId: folderId,
    documentIds,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  return { chat, created };
}

/** Entries to add so every saved paper appears in the tree, filed in `defaultPaperFolder`. */
export function placeUnfiledPapers(
  entries: VaultEntry[],
  records: DocumentRecord[],
  now = new Date().toISOString(),
): VaultEntry[] {
  const placed = new Set(
    entries.flatMap((entry) => (entry.kind === "paper" ? [entry.documentId] : [])),
  );
  const unfiled = records.filter((record) => !placed.has(record.id));
  if (!unfiled.length) return [];

  const { folderId, created } = defaultPaperFolder(entries, now);
  const papers = unfiled.map((record): VaultPaper => ({
    // One entry per paper: a repeated placement overwrites instead of duplicating.
    id: `paper-${record.id}`,
    kind: "paper",
    name: paperName(record),
    parentId: folderId,
    documentId: record.id,
    createdAt: now,
    updatedAt: now,
  }));
  return [...created, ...papers];
}

/** The entry and everything inside it, for deleting a folder. */
export function collectDescendants(entries: VaultEntry[], id: string): VaultEntry[] {
  const result: VaultEntry[] = [];
  const visit = (currentId: string) => {
    const entry = entries.find((candidate) => candidate.id === currentId);
    if (!entry) return;
    result.push(entry);
    for (const child of entries) if (child.parentId === currentId) visit(child.id);
  };
  visit(id);
  return result;
}

/** A folder can't be moved into itself or one of its own subfolders. */
export function canMove(entries: VaultEntry[], id: string, targetFolderId: string | null): boolean {
  if (targetFolderId === null) return true;
  if (id === targetFolderId) return false;
  return !collectDescendants(entries, id).some((entry) => entry.id === targetFolderId);
}

/** "Untitled", then "Untitled 1", "Untitled 2", … among siblings of the same kind. */
export function uniqueName(
  entries: VaultEntry[],
  parentId: string | null,
  base: string,
  exceptId?: string,
): string {
  const taken = new Set(
    entries
      .filter((entry) => entry.parentId === parentId && entry.id !== exceptId)
      .map((entry) => entry.name.toLowerCase()),
  );
  if (!taken.has(base.toLowerCase())) return base;
  for (let suffix = 1; ; suffix += 1) {
    const candidate = `${base} ${suffix}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Resolves a `[[wikilink]]` by name, ignoring case. Folders can't be linked. */
export function findByName(entries: VaultEntry[], name: string): VaultEntry | null {
  const wanted = name.trim().toLowerCase();
  return (
    entries.find((entry) => entry.kind !== "folder" && entry.name.toLowerCase() === wanted) ?? null
  );
}

/** Folder names from the root down to the entry's parent, e.g. ["Topic1", "Notes"]. */
export function folderPath(entries: VaultEntry[], id: string): string[] {
  const path: string[] = [];
  const seen = new Set<string>();
  let current = entries.find((entry) => entry.id === id)?.parentId ?? null;
  while (current && !seen.has(current)) {
    seen.add(current);
    const folder = entries.find((entry) => entry.id === current);
    if (!folder) break;
    path.unshift(folder.name);
    current = folder.parentId;
  }
  return path;
}

/** The folder new items go into when something is selected in the tree. */
export function targetFolder(entries: VaultEntry[], selectedId: string | null): string | null {
  const selected = entries.find((entry) => entry.id === selectedId);
  if (!selected) return null;
  return selected.kind === "folder" ? selected.id : selected.parentId;
}
