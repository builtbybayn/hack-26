"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parseDocument } from "@/lib/api/intelligence-client";
import {
  deleteDocumentRecord,
  deleteVaultEntries,
  getPaperFile,
  listDocumentRecords,
  listVaultEntries,
  putVaultEntries,
  savePaperFile,
  subscribeStoreChanges,
  type DocumentRecord,
} from "@/lib/browser-store";
import { runPaperPipeline } from "@/lib/paper-pipeline";
import type { VaultChat, VaultEntry, VaultFolder, VaultNote, VaultPaper } from "@/types/vault";
import {
  collectDescendants,
  defaultPaperFolder,
  newChatEntries,
  newId,
  paperName,
  placeUnfiledPapers,
  uniqueName,
} from "./vault-tree";

/**
 * Everything in the vault, with the operations the UI needs. Writes are applied to state first
 * and then saved, so the tree responds instantly.
 */
export function useVault() {
  const [entries, setEntries] = useState<VaultEntry[] | null>(null);
  const [records, setRecords] = useState<Map<string, DocumentRecord>>(new Map());
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [importError, setImportError] = useState<string | null>(null);
  const entriesRef = useRef<VaultEntry[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  const commitEntries = useCallback((next: VaultEntry[]) => {
    entriesRef.current = next;
    setEntries(next);
  }, []);

  const apply = useCallback(
    ({ stored, documents }: Awaited<ReturnType<typeof loadVault>>) => {
      commitEntries(stored);
      setRecords(new Map(documents.map((record) => [record.id, record])));
    },
    [commitEntries],
  );
  const reload = useCallback(async () => apply(await loadVault()), [apply]);

  useEffect(() => {
    void loadVault().then(apply);
    // Papers saved by the extension panel (or another tab) appear without a refresh.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeStoreChanges((change) => {
      if (change === "annotations") return;
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 150);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [apply, reload]);

  const save = useCallback(
    (changed: VaultEntry[]) => {
      const ids = new Set(changed.map((entry) => entry.id));
      commitEntries([...entriesRef.current.filter((entry) => !ids.has(entry.id)), ...changed]);
      void putVaultEntries(changed);
    },
    [commitEntries],
  );

  const now = () => new Date().toISOString();

  const createFolder = useCallback(
    (parentId: string | null, name = "Untitled"): VaultFolder => {
      const at = now();
      const folder: VaultFolder = {
        id: newId(),
        kind: "folder",
        name: uniqueName(entriesRef.current, parentId, name),
        parentId,
        createdAt: at,
        updatedAt: at,
      };
      save([folder]);
      return folder;
    },
    [save],
  );

  const createNote = useCallback(
    (parentId: string | null, name = "Untitled", body = ""): VaultNote => {
      const at = now();
      const note: VaultNote = {
        id: newId(),
        kind: "note",
        name: uniqueName(entriesRef.current, parentId, name),
        parentId,
        body,
        createdAt: at,
        updatedAt: at,
      };
      save([note]);
      return note;
    },
    [save],
  );

  /** A chat about the given papers, filed in the "Chats" folder. */
  /** A chat about the given papers, filed in the "Chats" folder. */
  const createChat = useCallback(
    (documentIds: string[]): VaultChat => {
      const paper = documentIds[0] ? records.get(documentIds[0]) : undefined;
      const base = paper ? `Chat – ${paperName(paper).slice(0, 48)}` : "New chat";
      const { chat, created } = newChatEntries(entriesRef.current, documentIds, base);
      save([...created, chat]);
      return chat;
    },
    [records, save],
  );

  const update = useCallback(
    <T extends VaultEntry>(entry: T, patch: Partial<T>) => {
      // Merge into the latest copy, so a stale reference can't undo another change.
      const latest = (entriesRef.current.find((item) => item.id === entry.id) as T) ?? entry;
      const updated = { ...latest, ...patch, updatedAt: now() } as T;
      save([updated]);
      return updated;
    },
    [save],
  );

  const rename = useCallback(
    (entry: VaultEntry, name: string) => {
      const trimmed = name.trim().replace(/[\\/]/g, "-");
      if (!trimmed || trimmed === entry.name) return entry;
      return update(entry, {
        name: uniqueName(entriesRef.current, entry.parentId, trimmed, entry.id),
      });
    },
    [update],
  );

  const move = useCallback(
    (entry: VaultEntry, parentId: string | null) => {
      if (entry.parentId === parentId) return entry;
      return update(entry, {
        parentId,
        name: uniqueName(entriesRef.current, parentId, entry.name, entry.id),
      });
    },
    [update],
  );

  /** Deletes entries (folders with their contents). Deleted papers are removed from storage. */
  const remove = useCallback(
    async (entry: VaultEntry): Promise<string[]> => {
      const doomed = collectDescendants(entriesRef.current, entry.id);
      const ids = doomed.map((item) => item.id);
      commitEntries(entriesRef.current.filter((item) => !ids.includes(item.id)));
      await deleteVaultEntries(ids);
      const papers = doomed.filter((item): item is VaultPaper => item.kind === "paper");
      for (const paper of papers) {
        controllers.current.get(paper.documentId)?.abort();
        await deleteDocumentRecord(paper.documentId);
      }
      if (papers.length)
        setRecords((current) => {
          const next = new Map(current);
          for (const paper of papers) next.delete(paper.documentId);
          return next;
        });
      return ids;
    },
    [commitEntries],
  );

  const runPipeline = useCallback(async (record: DocumentRecord) => {
    const documentId = record.id;
    if (controllers.current.has(documentId)) return;
    const controller = new AbortController();
    controllers.current.set(documentId, controller);
    setRunning((current) => new Set(current).add(documentId));
    try {
      const file = await getPaperFile(documentId);
      await runPaperPipeline(record.document, {
        file: file ? { blob: file.file, fileName: file.fileName } : undefined,
        signal: controller.signal,
        onUpdate: (updated) => setRecords((current) => new Map(current).set(updated.id, updated)),
      });
    } catch {
      // Cancelled (the paper was deleted); failures are recorded on the pipeline steps.
    } finally {
      controllers.current.delete(documentId);
      setRunning((current) => {
        const next = new Set(current);
        next.delete(documentId);
        return next;
      });
    }
  }, []);

  /** Imports a PDF (or text/Markdown file) into a folder and starts its analysis. */
  const importPaper = useCallback(
    async (file: File, parentId: string | null): Promise<VaultPaper | null> => {
      setImportError(null);
      const parsed = await parseDocument(file, { mode: "automatic" });
      if (!parsed.ok) {
        setImportError(`${file.name}: ${parsed.error.message}`);
        return null;
      }
      const { document } = parsed.data;
      const existing = entriesRef.current.find(
        (entry): entry is VaultPaper => entry.kind === "paper" && entry.documentId === document.id,
      );
      const at = now();
      const record: DocumentRecord = records.get(document.id) ?? {
        id: document.id,
        document,
        analysis: null,
        updatedAt: at,
      };
      setRecords((current) => new Map(current).set(document.id, record));
      // No folder chosen: the first project's Papers folder.
      const target = parentId
        ? { folderId: parentId, created: [] }
        : defaultPaperFolder(entriesRef.current, at);
      if (!existing && target.created.length) save(target.created);
      const paper: VaultPaper = existing ?? {
        id: newId(),
        kind: "paper",
        name: uniqueName(entriesRef.current, target.folderId, paperName({ document })),
        parentId: target.folderId,
        documentId: document.id,
        createdAt: at,
        updatedAt: at,
      };
      if (!existing) save([paper]);
      // Save the file before the reader opens it, then analyze in the background.
      await savePaperFile(document.id, file, file.name);
      void runPipeline(record);
      return paper;
    },
    [records, runPipeline, save],
  );

  return {
    entries,
    records,
    running,
    importError,
    clearImportError: () => setImportError(null),
    reload,
    createFolder,
    createNote,
    createChat,
    update,
    rename,
    move,
    remove,
    runPipeline,
    importPaper,
  };
}

export type VaultApi = ReturnType<typeof useVault>;

/**
 * Reads the vault, filing any papers saved elsewhere (e.g. by the extension) into "Papers". Runs
 * under a lock shared by every tab, so two loads can't both file the same paper.
 */
async function loadVault() {
  const run = async () => {
    const [entries, documents] = await Promise.all([listVaultEntries(), listDocumentRecords()]);
    const added = placeUnfiledPapers(entries, documents);
    if (added.length) await putVaultEntries(added);
    return { stored: [...entries, ...added], documents };
  };
  return typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request("knowbefore-vault-load", run)
    : run();
}
