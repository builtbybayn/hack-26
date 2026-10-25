/**
 * Highlights and comments per paper, cached in memory so the reader and the sidebar list stay in
 * step. Writes go straight to IndexedDB; other pages are told through the store's broadcast.
 */
import { useEffect, useSyncExternalStore } from "react";
import {
  deleteAnnotation,
  listAnnotations,
  putAnnotation,
  subscribeStoreChanges,
} from "@/lib/browser-store";
import type { Annotation } from "@/types/vault";

const cache = new Map<string, Annotation[]>();
const loading = new Set<string>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Notified whenever this page adds, edits, or removes an annotation. */
export function subscribeAnnotations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function load(documentId: string) {
  if (loading.has(documentId)) return;
  loading.add(documentId);
  try {
    cache.set(documentId, sortAnnotations(await listAnnotations(documentId)));
    emit();
  } finally {
    loading.delete(documentId);
  }
}

/** Reading order: by page, then top to bottom. */
function sortAnnotations(annotations: Annotation[]): Annotation[] {
  const top = (annotation: Annotation) => Math.min(...annotation.rects.map((rect) => rect.y));
  return [...annotations].sort((a, b) => a.pageNumber - b.pageNumber || top(a) - top(b));
}

/** The paper's annotations in reading order, or null while loading. */
export function useAnnotations(documentId: string | null): Annotation[] | null {
  useEffect(() => {
    if (documentId && !cache.has(documentId)) void load(documentId);
  }, [documentId]);
  return useSyncExternalStore(
    subscribe,
    () => (documentId ? (cache.get(documentId) ?? null) : null),
    () => null,
  );
}

export async function saveAnnotation(annotation: Annotation): Promise<void> {
  await putAnnotation(annotation);
  const current = cache.get(annotation.documentId) ?? [];
  cache.set(
    annotation.documentId,
    sortAnnotations([...current.filter((entry) => entry.id !== annotation.id), annotation]),
  );
  emit();
}

export async function removeAnnotation(annotation: Annotation): Promise<void> {
  await deleteAnnotation(annotation.id);
  const current = cache.get(annotation.documentId) ?? [];
  cache.set(
    annotation.documentId,
    current.filter((entry) => entry.id !== annotation.id),
  );
  emit();
}

// Another page (e.g. a second vault tab) changed annotations: reload what we have cached.
if (typeof window !== "undefined") {
  subscribeStoreChanges((change) => {
    if (change !== "annotations") return;
    for (const documentId of cache.keys()) void load(documentId);
  });
}
