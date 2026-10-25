import type { VaultEntry } from "@/types/vault";

/** Mark the active subtree in one operation, preserving independently deleted children. */
export function entriesToTrash(entries: VaultEntry[], id: string, at: string): VaultEntry[] {
  const root = entries.find((entry) => entry.id === id && !entry.trashedAt);
  if (!root) throw new Error("This item is no longer available.");
  const ids = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const entry of entries) {
      if (!entry.trashedAt && entry.parentId && ids.has(entry.parentId) && !ids.has(entry.id)) {
        ids.add(entry.id);
        grew = true;
      }
    }
  }
  return entries
    .filter((entry) => ids.has(entry.id))
    .map((entry) => ({ ...entry, trashedAt: at, trashRootId: id }));
}

/** Restore the whole deletion batch; parent folders must be restored first. */
export function entriesToRestore(entries: VaultEntry[], id: string): VaultEntry[] {
  const selected = entries.find((entry) => entry.id === id && entry.trashedAt);
  if (!selected) throw new Error("This item is no longer in Trash.");
  const rootId = selected.trashRootId || selected.id;
  const root = entries.find((entry) => entry.id === rootId)!;
  const parent = entries.find((entry) => entry.id === root.parentId);
  if (parent?.trashedAt) throw new Error("Restore the containing folder from Trash first.");
  const parentId = parent?.id ?? null;
  const taken = new Set(
    entries
      .filter((entry) => !entry.trashedAt && entry.parentId === parentId)
      .map((entry) => entry.name.toLowerCase()),
  );
  let name = root.name;
  for (let suffix = 1; taken.has(name.toLowerCase()); suffix++) name = `${root.name} ${suffix}`;
  return entries
    .filter((entry) => entry.trashedAt && (entry.trashRootId || entry.id) === rootId)
    .map((entry) => {
      const restored = { ...entry };
      delete restored.trashedAt;
      delete restored.trashRootId;
      if (entry.id === rootId) {
        restored.name = name;
        restored.parentId = parentId;
      }
      return restored;
    });
}

/** Trashing a placement must not let the importer recreate it as an unfiled paper. */
export function visibleDocumentRecords<T extends { id: string }>(
  records: T[],
  entries: VaultEntry[],
): T[] {
  const active = new Set(
    entries.flatMap((entry) =>
      entry.kind === "paper" && !entry.trashedAt ? [entry.documentId] : [],
    ),
  );
  const hidden = new Set(
    entries.flatMap((entry) =>
      entry.kind === "paper" && entry.trashedAt && !active.has(entry.documentId)
        ? [entry.documentId]
        : [],
    ),
  );
  return records.filter((record) => !hidden.has(record.id));
}

/** Late autosaves cannot resurrect a deleted note or write into a deleted folder. */
export function validateVaultWrite(existing: VaultEntry[], incoming: VaultEntry[]) {
  const byId = new Map(existing.map((entry) => [entry.id, entry]));
  for (const entry of incoming) {
    if (byId.get(entry.id)?.trashedAt || (entry.parentId && byId.get(entry.parentId)?.trashedAt))
      throw new Error("This item was moved to Trash. Restore it before editing.");
  }
}
