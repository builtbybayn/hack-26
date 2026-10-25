"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ChatView } from "@/features/vault/ChatView";
import {
  listDocumentRecords,
  listVaultEntries,
  putVaultEntries,
  subscribeStoreChanges,
  type DocumentRecord,
} from "@/lib/browser-store";
import type { VaultChat } from "@/types/vault";

/** Keep extension and earlier vault conversations usable in the migrated workspace. */
export function SavedChats() {
  const router = useRouter();
  const [chats, setChats] = useState<VaultChat[]>([]);
  const [records, setRecords] = useState(new Map<string, DocumentRecord>());
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () =>
      void Promise.all([listVaultEntries(), listDocumentRecords()])
        .then(([entries, papers]) => {
          if (!active) return;
          setChats(
            entries
              .filter((entry): entry is VaultChat => entry.kind === "chat")
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
          );
          setRecords(new Map(papers.map((paper) => [paper.id, paper])));
        })
        .catch(() => {
          if (active) setError("Saved conversations could not be loaded.");
        });
    load();
    const unsubscribe = subscribeStoreChanges(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const selected = chats.find((chat) => chat.id === selectedId) || chats[0];
  async function update(patch: Partial<VaultChat>) {
    if (!selected) return;
    const next = { ...selected, ...patch, updatedAt: new Date().toISOString() };
    setChats((current) => current.map((chat) => (chat.id === next.id ? next : chat)));
    try {
      await putVaultEntries([next]);
      setError("");
    } catch {
      setError("The conversation could not be saved. Keep this page open and try again.");
    }
  }
  return (
    <div className="workspace-research-tools theme-obsidian" data-theme="dark">
      {error && <p role="alert">{error}</p>}
      {selected ? (
        <>
          <label className="mt-3 block text-sm">
            Saved conversation
            <select
              className="input mt-2"
              value={selected.id}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {chats.map((chat) => (
                <option key={chat.id} value={chat.id}>
                  {chat.name}
                </option>
              ))}
            </select>
          </label>
          <div className="saved-chat-view">
            <ChatView
              key={selected.id}
              chat={selected}
              records={records}
              passage={null}
              onPassageChange={() => {}}
              onChange={(patch) => void update(patch)}
              onOpenPage={(documentId, page) =>
                router.push(
                  `/reader?${new URLSearchParams({ doc: documentId, passage: `p${page}` })}`,
                )
              }
            />
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Conversations saved by the browser extension appear here.
        </p>
      )}
    </div>
  );
}
