/**
 * The research vault: an Obsidian-style tree of folders, notes, papers, and AI chats, plus the
 * highlights and margin comments made on papers. All of it lives in the browser
 * (`@/lib/browser-store`); nothing here is sent to the server except chat context.
 */

export type VaultEntryKind = "folder" | "note" | "paper" | "chat";

interface VaultEntryBase {
  id: string;
  kind: VaultEntryKind;
  name: string;
  /** Containing folder, or null at the vault root. */
  parentId: string | null;
  bookmarked?: boolean;
  createdAt: string;
  updatedAt: string;
  /** Recoverable deletion; the original hierarchy and stored paper content are retained. */
  trashedAt?: string;
  trashRootId?: string;
}

export interface VaultFolder extends VaultEntryBase {
  kind: "folder";
}

export interface VaultNote extends VaultEntryBase {
  kind: "note";
  /** Markdown. `[[Name]]` links to another note, paper, or chat by name. */
  body: string;
  /** Research context set by the workspace: a question to resolve, or a link to its source. */
  meta?: {
    question?: boolean;
    resolved?: boolean;
    location?: { documentId: string; page?: number; passageId?: string; quote?: string };
    conceptId?: string;
    findingId?: string;
  };
}

/** A saved paper placed in the tree. The paper itself is the `DocumentRecord` it points to. */
export interface VaultPaper extends VaultEntryBase {
  kind: "paper";
  documentId: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** A passage the user quoted from a paper when asking. */
  passage?: ChatPassage;
  createdAt: string;
  /** Set when the assistant reply failed; `content` holds the error message. */
  failed?: boolean;
}

export interface ChatPassage {
  documentId: string;
  pageNumber: number;
  text: string;
}

export interface VaultChat extends VaultEntryBase {
  kind: "chat";
  /** Papers the assistant can read in this conversation. */
  documentIds: string[];
  messages: ChatMessage[];
}

export type VaultEntry = VaultFolder | VaultNote | VaultPaper | VaultChat;

export type HighlightColor = "yellow" | "blue" | "green" | "pink";

/** A rectangle on a page, as fractions of the page's width and height (zoom-independent). */
export interface PageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A highlight on a paper, optionally with a margin comment. */
export interface Annotation {
  id: string;
  documentId: string;
  pageNumber: number;
  rects: PageRect[];
  /** The highlighted text, used for lists, search, and asking the AI about it. */
  quote: string;
  color: HighlightColor;
  comment: string | null;
  author: string;
  createdAt: string;
  updatedAt: string;
}
