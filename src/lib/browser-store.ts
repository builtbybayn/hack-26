/**
 * Browser-side persistence (IndexedDB). The single source of truth for parsed documents,
 * analyses, and mastery: the server keeps no state between requests.
 *
 * Browser-only: works in web pages and extension pages, never in server code. Each origin has
 * its own database, so the web app and an extension page that loads it share data; a separately
 * bundled extension page would not.
 */
import type { ContradictionReport } from "@/types/contradictions";
import type { DocumentAnalysis, MasteryLevel } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";
import type { PaperPipeline } from "@/types/pipeline";
import type { RecommendationsResult } from "@/types/research";

const DB_NAME = "knowbefore";
const DB_VERSION = 5;
const MASTERY_STORE = "mastery";
const DOCUMENT_STORE = "documents";
const AUDIO_STORE = "audio";
const READING_STORE = "readingPositions";
const FILE_STORE = "files";
/** Generated speech kept for replay. Oldest entries are evicted beyond this count. */
const MAX_CACHED_AUDIO = 400;

interface MasteryRecord {
  conceptId: string;
  level: MasteryLevel;
  updatedAt: string;
}

/** A saved paper and everything derived from it. Keyed by the document's content hash. */
export interface DocumentRecord {
  id: string;
  document: ParsedDocument;
  analysis: DocumentAnalysis | null;
  recommendations?: RecommendationsResult | null;
  contradictions?: ContradictionReport | null;
  /** Progress of the "Analyze this paper" pipeline (src/lib/paper-pipeline.ts). */
  pipeline?: PaperPipeline;
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

/**
 * Saves a paper, keeping anything already derived from it. A `null` analysis keeps the stored
 * one; pass an analysis to replace it.
 */
export async function saveDocument(
  document: ParsedDocument,
  analysis: DocumentAnalysis | null = null,
): Promise<void> {
  const existing = await getDocumentRecord(document.id);
  await request(DOCUMENT_STORE, "readwrite", (store) =>
    store.put({
      ...existing,
      id: document.id,
      document,
      analysis: analysis ?? existing?.analysis ?? null,
      updatedAt: new Date().toISOString(),
    } satisfies DocumentRecord),
  );
}

/** Merges derived results into a saved paper. Returns the updated record, or null if absent. */
export async function updateDocumentRecord(
  documentId: string,
  patch: Partial<Omit<DocumentRecord, "id" | "document" | "updatedAt">>,
): Promise<DocumentRecord | null> {
  const existing = await getDocumentRecord(documentId);
  if (!existing) return null;
  const updated: DocumentRecord = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await request(DOCUMENT_STORE, "readwrite", (store) => store.put(updated));
  return updated;
}

/** The original uploaded file (e.g. the PDF), kept so the vault can show the real paper. */
export async function savePaperFile(documentId: string, file: Blob, fileName: string) {
  await request(FILE_STORE, "readwrite", (store) => store.put({ documentId, file, fileName }));
}

export async function getPaperFile(
  documentId: string,
): Promise<{ file: Blob; fileName: string } | null> {
  const record = await request<{ file: Blob; fileName: string } | undefined>(
    FILE_STORE,
    "readonly",
    (store) => store.get(documentId),
  );
  return record ?? null;
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

interface AudioRecord {
  key: string;
  audio: Blob;
  createdAt: string;
}

/** Cached speech for a voice + text key, so replays never spend voice credits twice. */
export async function getCachedAudio(key: string): Promise<Blob | null> {
  const record = await request<AudioRecord | undefined>(AUDIO_STORE, "readonly", (store) =>
    store.get(key),
  );
  return record?.audio ?? null;
}

export async function cacheAudio(key: string, audio: Blob): Promise<void> {
  await request(AUDIO_STORE, "readwrite", (store) =>
    store.put({ key, audio, createdAt: new Date().toISOString() } satisfies AudioRecord),
  );
  await evictOldestAudio();
}

/** Where the reader stopped in a document (segment index), for resuming later. */
export async function getReadingPosition(documentId: string): Promise<number | null> {
  const record = await request<{ segmentIndex: number } | undefined>(
    READING_STORE,
    "readonly",
    (store) => store.get(documentId),
  );
  return record?.segmentIndex ?? null;
}

export async function saveReadingPosition(documentId: string, segmentIndex: number): Promise<void> {
  await request(READING_STORE, "readwrite", (store) =>
    store.put({ documentId, segmentIndex, updatedAt: new Date().toISOString() }),
  );
}

async function evictOldestAudio(): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE, "readwrite");
    const store = transaction.objectStore(AUDIO_STORE);
    const count = store.count();
    count.onsuccess = () => {
      let excess = count.result - MAX_CACHED_AUDIO;
      if (excess <= 0) return;
      // Walk keys oldest-first via the createdAt index, deleting until under the limit.
      store.index("createdAt").openKeyCursor().onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursor | null>).result;
        if (!cursor || excess <= 0) return;
        store.delete(cursor.primaryKey);
        excess -= 1;
        cursor.continue();
      };
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
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
      if (!db.objectStoreNames.contains(AUDIO_STORE)) {
        db.createObjectStore(AUDIO_STORE, { keyPath: "key" }).createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains(READING_STORE))
        db.createObjectStore(READING_STORE, { keyPath: "documentId" });
      if (!db.objectStoreNames.contains(FILE_STORE))
        db.createObjectStore(FILE_STORE, { keyPath: "documentId" });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}
