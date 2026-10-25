/**
 * Research chat contract. The server is stateless: every request carries the conversation so far
 * and the papers the assistant may read.
 */
import type { ApiResponse, CommonErrorCode } from "./api";
import type { IntelligenceErrorCode } from "./intelligence";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  /** A passage quoted from a paper with this turn. */
  passage?: { title: string; pageNumber: number; text: string };
}

/** A paper the assistant can read. The server trims long papers to fit its context budget. */
export interface ChatPaperContext {
  title: string;
  subject?: string;
  topics?: string[];
  pages: { pageNumber: number; text: string }[];
}

export interface ChatRequest {
  /** Oldest first; the last turn is the user's new message. */
  messages: ChatTurn[];
  papers: ChatPaperContext[];
}

export interface ChatResult {
  /** Markdown. Page references are written as "(p. 4)". */
  reply: string;
}

export type ChatResponse = ApiResponse<ChatResult, IntelligenceErrorCode | CommonErrorCode>;
