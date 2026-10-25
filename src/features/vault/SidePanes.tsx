"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Bookmark, FileText, MessageSquare, StickyNote } from "lucide-react";
import type { DocumentRecord } from "@/lib/browser-store";
import type { VaultEntry } from "@/types/vault";
import { folderPath } from "./vault-tree";

interface SearchMatch {
  text: string;
  start: number;
  length: number;
  pageNumber?: number;
}

interface SearchResult {
  entry: VaultEntry;
  nameMatch: boolean;
  matches: SearchMatch[];
}

const MAX_MATCHES_PER_ENTRY = 3;
const SNIPPET_RADIUS = 60;

/** Finds the query in names, note text, chat messages, and paper text. Case-insensitive. */
export function searchVault(
  query: string,
  entries: VaultEntry[],
  records: Map<string, DocumentRecord>,
): SearchResult[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const results: SearchResult[] = [];
  for (const entry of entries) {
    if (entry.kind === "folder") continue;
    const sources: { text: string; pageNumber?: number }[] =
      entry.kind === "note"
        ? [{ text: entry.body }]
        : entry.kind === "chat"
          ? entry.messages.map((message) => ({ text: message.content }))
          : (records.get(entry.documentId)?.document.pages ?? []).map((page) => ({
              text: page.text,
              pageNumber: page.pageNumber,
            }));
    const matches: SearchMatch[] = [];
    for (const source of sources) {
      const haystack = source.text.toLowerCase();
      let index = haystack.indexOf(needle);
      while (index !== -1 && matches.length < MAX_MATCHES_PER_ENTRY) {
        const from = Math.max(0, index - SNIPPET_RADIUS);
        const to = Math.min(source.text.length, index + needle.length + SNIPPET_RADIUS);
        const prefix = from > 0 ? "…" : "";
        matches.push({
          text: `${prefix}${source.text.slice(from, to).replace(/\s+/g, " ")}${to < source.text.length ? "…" : ""}`,
          start: prefix.length + source.text.slice(from, index).replace(/\s+/g, " ").length,
          length: needle.length,
          pageNumber: source.pageNumber,
        });
        index = haystack.indexOf(needle, index + needle.length);
      }
      if (matches.length >= MAX_MATCHES_PER_ENTRY) break;
    }
    const nameMatch = entry.name.toLowerCase().includes(needle);
    if (nameMatch || matches.length) results.push({ entry, nameMatch, matches });
  }
  return results.sort((a, b) => Number(b.nameMatch) - Number(a.nameMatch));
}

export function SearchPane({
  entries,
  records,
  onOpen,
}: {
  entries: VaultEntry[];
  records: Map<string, DocumentRecord>;
  onOpen: (entry: VaultEntry, pageNumber?: number) => void;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const results = useMemo(
    () => searchVault(deferred, entries, records),
    [deferred, entries, records],
  );

  return (
    <div className="search-pane">
      <div className="search-input-container">
        <input
          type="search"
          autoFocus
          aria-label="Search the vault"
          placeholder="Search papers, notes, and chats…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {deferred.trim() && (
        <p className="search-summary">
          {results.length} {results.length === 1 ? "result" : "results"}
        </p>
      )}
      <div className="search-results">
        {results.map(({ entry, matches }) => (
          <div key={entry.id} className="search-result">
            <button type="button" className="search-result-title" onClick={() => onOpen(entry)}>
              <KindIcon entry={entry} />
              <span>{entry.name}</span>
            </button>
            {matches.map((match, index) => (
              <button
                type="button"
                key={index}
                className="search-result-match"
                onClick={() => onOpen(entry, match.pageNumber)}
              >
                {match.pageNumber !== undefined && (
                  <span className="search-result-page">p. {match.pageNumber}</span>
                )}
                {match.text.slice(0, match.start)}
                <mark>{match.text.slice(match.start, match.start + match.length)}</mark>
                {match.text.slice(match.start + match.length)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BookmarksPane({
  entries,
  onOpen,
}: {
  entries: VaultEntry[];
  onOpen: (entry: VaultEntry) => void;
}) {
  const bookmarks = entries.filter((entry) => entry.bookmarked);
  return (
    <div className="bookmarks-pane">
      {bookmarks.length === 0 ? (
        <p className="nav-empty">
          <Bookmark size={16} aria-hidden /> Right-click a paper, note, or chat and choose Bookmark
          to keep it here.
        </p>
      ) : (
        bookmarks.map((entry) => (
          <button
            type="button"
            key={entry.id}
            className="bookmark-item"
            onClick={() => onOpen(entry)}
            title={[...folderPath(entries, entry.id), entry.name].join(" / ")}
          >
            <KindIcon entry={entry} />
            <span>{entry.name}</span>
          </button>
        ))
      )}
    </div>
  );
}

export function KindIcon({ entry }: { entry: VaultEntry }) {
  if (entry.kind === "paper") return <FileText size={14} aria-hidden />;
  if (entry.kind === "chat") return <MessageSquare size={14} aria-hidden />;
  return <StickyNote size={14} aria-hidden />;
}
