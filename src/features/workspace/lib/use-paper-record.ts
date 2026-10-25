"use client";
import { useEffect, useState } from "react";
import { getDocumentRecord, type DocumentRecord } from "@/lib/browser-store";
import type { Document } from "./models";

/** Reload derived analysis as the workspace's document snapshot changes, even at the same count. */
export function usePaperRecord(documentId: string | null, documents: readonly Document[]) {
  const [state, setState] = useState<{ id: string | null; record: DocumentRecord | null }>({
    id: null,
    record: null,
  });
  useEffect(() => {
    if (!documentId) return;
    let active = true;
    void getDocumentRecord(documentId)
      .then((record) => {
        if (active) setState({ id: documentId, record });
      })
      .catch(() => {
        if (active) setState({ id: documentId, record: null });
      });
    return () => {
      active = false;
    };
  }, [documentId, documents]);
  return state.id === documentId ? state.record : null;
}
