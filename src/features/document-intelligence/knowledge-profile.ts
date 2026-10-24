import type { DocumentAnalysis, MasteryLevel } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";

const DB_NAME = "knowbefore";
const STORE_NAME = "mastery";
const SESSION_STORE = "sessions";

interface MasteryRecord {
  conceptId: string;
  level: MasteryLevel;
  updatedAt: string;
}

interface StoredSession {
  id: "latest";
  document: ParsedDocument;
  analysis: DocumentAnalysis;
  updatedAt: string;
}

export async function loadMastery(): Promise<Record<string, MasteryLevel>> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
    request.onsuccess = () =>
      resolve(
        Object.fromEntries(
          (request.result as MasteryRecord[]).map((record) => [record.conceptId, record.level]),
        ),
      );
    request.onerror = () => reject(request.error);
  });
}

export async function saveMastery(conceptId: string, level: MasteryLevel): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction
      .objectStore(STORE_NAME)
      .put({ conceptId, level, updatedAt: new Date().toISOString() } satisfies MasteryRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadLatestSession(): Promise<Omit<StoredSession, "id" | "updatedAt"> | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(SESSION_STORE, "readonly")
      .objectStore(SESSION_STORE)
      .get("latest");
    request.onsuccess = () => {
      const session = request.result as StoredSession | undefined;
      resolve(session ? { document: session.document, analysis: session.analysis } : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveLatestSession(
  document: ParsedDocument,
  analysis: DocumentAnalysis,
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(SESSION_STORE, "readwrite");
    transaction.objectStore(SESSION_STORE).put({
      id: "latest",
      document,
      analysis,
      updatedAt: new Date().toISOString(),
    } satisfies StoredSession);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME, { keyPath: "conceptId" });
      if (!request.result.objectStoreNames.contains(SESSION_STORE))
        request.result.createObjectStore(SESSION_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
