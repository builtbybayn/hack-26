/**
 * Browser-side persistence (IndexedDB). The single source of truth for parsed documents,
 * analyses, and mastery: the server keeps no state between requests.
 *
 * Browser-only: works in web pages and extension pages, never in server code. Each origin has
 * its own database, so the web app and an extension page that loads it share data; a separately
 * bundled extension page would not.
 */
import type { DocumentAnalysis, MasteryLevel } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";

const DB_NAME = "knowbefore";
const DB_VERSION = 3;
const MASTERY_STORE = "mastery";
const DOCUMENT_STORE = "documents";

interface MasteryRecord {
  conceptId: string;
  level: MasteryLevel;
  updatedAt: string;
}

/** A parsed document plus its analysis once one exists. Keyed by the document's content hash. */
export interface DocumentRecord {
  id: string;
  document: ParsedDocument;
  analysis: DocumentAnalysis | null;
  updatedAt: string;
}

export async function loadMastery(): Promise<Record<string, MasteryLevel>> {
  const records = await request<MasteryRecord[]>(MASTERY_STORE, "readonly", (store) =>
    store.getAll(),
  );
  return Object.fromEntries(records.map((record) => [record.conceptId, record.level]));
}

export async function saveMastery(conceptId: string, level: MasteryLevel): Promise<void> {
  await request(MASTERY_STORE, "readwrite", (store) =>
    store.put({ conceptId, level, updatedAt: new Date().toISOString() } satisfies MasteryRecord),
  );
}

export async function saveDocument(
  document: ParsedDocument,
  analysis: DocumentAnalysis | null = null,
): Promise<void> {
  await request(DOCUMENT_STORE, "readwrite", (store) =>
    store.put({
      id: document.id,
      document,
      analysis,
      updatedAt: new Date().toISOString(),
    } satisfies DocumentRecord),
  );
}

export async function getDocumentRecord(documentId: string): Promise<DocumentRecord | null> {
  const record = await request<DocumentRecord | undefined>(DOCUMENT_STORE, "readonly", (store) =>
    store.get(documentId),
  );
  return record ?? null;
}

/** All stored documents, most recently updated first. */
export async function listDocumentRecords(): Promise<DocumentRecord[]> {
  const records = await request<DocumentRecord[]>(DOCUMENT_STORE, "readonly", (store) =>
    store.getAll(),
  );
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadLatestDocument(): Promise<DocumentRecord | null> {
  return (await listDocumentRecords())[0] ?? null;
}

async function request<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest,
): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const result = run(transaction.objectStore(storeName));
    transaction.oncomplete = () => resolve(result.result as T);
    transaction.onerror = () => reject(transaction.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(MASTERY_STORE))
        db.createObjectStore(MASTERY_STORE, { keyPath: "conceptId" });
      if (!db.objectStoreNames.contains(DOCUMENT_STORE))
        db.createObjectStore(DOCUMENT_STORE, { keyPath: "id" });
      // Version 2 kept a single "latest" session; documents now live in DOCUMENT_STORE.
      if (db.objectStoreNames.contains("sessions")) db.deleteObjectStore("sessions");
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
