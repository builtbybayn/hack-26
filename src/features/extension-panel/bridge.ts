/**
 * Panel side of the extension bridge. The extension page (extension/sidepanel.js) embeds /panel
 * and answers requests that need Chrome APIs. Keep the protocol in step with that file.
 */
import { useEffect, useRef, useState } from "react";

export interface TabInfo {
  title: string;
  url: string;
  /** `pdf`: the tab shows a PDF. `page`: an article or other web page. */
  kind: "pdf" | "page" | "unsupported";
}

export type TabPaper =
  | { kind: "pdf"; bytes: ArrayBuffer; fileName: string; url: string }
  | { kind: "text"; text: string; title?: string; fileName: string; url: string };

export interface TabSelection {
  text: string;
  title?: string;
  url?: string;
}

type Request = "kb:get-selection" | "kb:get-paper";

interface BridgeHandlers {
  onPaper: (paper: TabPaper) => void;
  onSelection: (selection: TabSelection) => void;
  onError: (request: Request, message: string) => void;
}

export function useExtensionBridge(handlers: BridgeHandlers) {
  const [tab, setTab] = useState<TabInfo | null>(null);
  const [pending, setPending] = useState<Request | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (window.parent === window) return;
    const onMessage = (event: MessageEvent) => {
      // Only the extension page that embeds us may talk to the panel.
      if (event.source !== window.parent || !event.origin.startsWith("chrome-extension://")) return;
      const data = event.data as { type?: string } & Record<string, unknown>;
      switch (data?.type) {
        case "kb:tab":
          setTab(data.tab as TabInfo);
          return;
        case "kb:selection":
          setPending(null);
          handlersRef.current.onSelection(data as unknown as TabSelection);
          return;
        case "kb:paper":
          setPending(null);
          handlersRef.current.onPaper(data as unknown as TabPaper);
          return;
        case "kb:error":
          setPending(null);
          handlersRef.current.onError(data.request as Request, String(data.message));
      }
    };
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: "kb:ready" }, "*");
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Requests carry nothing private (at most a paper's content hash), so the parent's unknown
  // chrome-extension:// origin can be "*".
  const send = (type: string, extra: object = {}) =>
    window.parent.postMessage({ type, ...extra }, "*");

  return {
    /** Null until the extension reports a tab (always null when opened outside the extension). */
    tab,
    pending,
    requestSelection: () => {
      setPending("kb:get-selection");
      send("kb:get-selection");
    },
    requestPaper: () => {
      setPending("kb:get-paper");
      send("kb:get-paper");
    },
    /** Opens (or reuses) the vault tab showing a vault entry, e.g. a project's roadmap note. */
    openEntry: (entryId: string) => send("kb:open-app", { path: `/?entry=${entryId}` }),
    /** Opens (or reuses) the vault tab, showing a saved paper at a page when given one. */
    openApp: (documentId?: string, page?: number) =>
      send(
        "kb:open-app",
        documentId ? { path: `/?paper=${documentId}${page ? `&page=${page}` : ""}` } : {},
      ),
  };
}

const TAB_PAPERS_KEY = "knowbefore.tabPapers";

/** Remembers which stored paper came from which URL, so the panel can follow the active tab. */
export function paperForUrl(url: string): string | null {
  try {
    const map = JSON.parse(localStorage.getItem(TAB_PAPERS_KEY) ?? "{}") as Record<string, string>;
    return map[normalizeUrl(url)] ?? null;
  } catch {
    return null;
  }
}

export function rememberPaperForUrl(url: string, documentId: string): void {
  try {
    const map = JSON.parse(localStorage.getItem(TAB_PAPERS_KEY) ?? "{}") as Record<string, string>;
    map[normalizeUrl(url)] = documentId;
    localStorage.setItem(TAB_PAPERS_KEY, JSON.stringify(map));
  } catch {
    // Without storage the panel still works; it just won't auto-select this paper next time.
  }
}

/** The page in a PDF link like `paper.pdf#page=4`, if any. */
export function pageFromUrl(url: string): number | null {
  const match = url.match(/#(?:.*&)?page=(\d+)/);
  return match ? Number(match[1]) : null;
}

function normalizeUrl(url: string): string {
  return url.split("#")[0];
}
