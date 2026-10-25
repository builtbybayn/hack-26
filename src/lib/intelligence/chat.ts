import "server-only";

import { generateText } from "@/lib/ai/gemini";
import type { ChatPaperContext, ChatRequest, ChatResult } from "@/types/chat";

/** Characters of paper text sent to the model, shared across all attached papers. */
const PAPER_BUDGET = 60_000;
/** Earlier turns beyond this many are dropped; the papers carry the important context. */
const MAX_TURNS = 16;

export async function answerChat(request: ChatRequest, signal?: AbortSignal): Promise<ChatResult> {
  const reply = await generateText(buildChatPrompt(request), {
    maxOutputTokens: 4_000,
    temperature: 0.4,
    signal,
  });
  return { reply: reply.trim() };
}

/** Pure prompt assembly, exported for tests. */
export function buildChatPrompt({ messages, papers }: ChatRequest): string {
  const turns = messages.slice(-MAX_TURNS);
  const quotedPages = new Map<string, Set<number>>();
  for (const turn of turns) {
    if (!turn.passage) continue;
    const pages = quotedPages.get(turn.passage.title) ?? new Set();
    pages.add(turn.passage.pageNumber);
    quotedPages.set(turn.passage.title, pages);
  }

  const perPaper = Math.floor(PAPER_BUDGET / Math.max(papers.length, 1));
  const library = papers
    .map((paper, index) =>
      describePaper(paper, index + 1, perPaper, quotedPages.get(paper.title) ?? new Set()),
    )
    .join("\n\n");

  const conversation = turns
    .map((turn) => {
      const quote = turn.passage
        ? `[Quoting "${turn.passage.title}", p. ${turn.passage.pageNumber}: "${turn.passage.text}"]\n`
        : "";
      return `${turn.role === "user" ? "User" : "Assistant"}: ${quote}${turn.content}`;
    })
    .join("\n\n");

  return [
    "You are a research assistant inside a reader's paper vault. Answer the user's latest message.",
    "Ground answers in the papers below and cite pages as (p. N), naming the paper when several are attached.",
    "When you add background knowledge that is not in the papers, say so. If the papers do not answer the question, say that plainly instead of guessing.",
    "Write concise Markdown: short paragraphs, lists where they help, LaTeX only inside $...$.",
    papers.length ? `\nPapers:\n${library}` : "\nNo papers are attached to this conversation.",
    `\nConversation:\n${conversation}\n\nAssistant:`,
  ].join("\n");
}

function describePaper(
  paper: ChatPaperContext,
  number: number,
  budget: number,
  priorityPages: Set<number>,
): string {
  // Quoted pages first so the passage's surroundings always fit, then the paper in order.
  const ordered = [
    ...paper.pages.filter((page) => priorityPages.has(page.pageNumber)),
    ...paper.pages.filter((page) => !priorityPages.has(page.pageNumber)),
  ];
  const included: { pageNumber: number; text: string }[] = [];
  let used = 0;
  for (const page of ordered) {
    const text = page.text.trim();
    if (!text) continue;
    if (used + text.length > budget) {
      const room = budget - used;
      if (room > 500) included.push({ pageNumber: page.pageNumber, text: text.slice(0, room) });
      break;
    }
    included.push({ pageNumber: page.pageNumber, text });
    used += text.length;
  }
  const omitted = paper.pages.length - included.length;
  const header = [
    `=== Paper ${number}: "${paper.title}" ===`,
    paper.subject ? `Subject: ${paper.subject}` : null,
    paper.topics?.length ? `Topics: ${paper.topics.join(", ")}` : null,
    omitted > 0 ? `(${omitted} page(s) omitted for length.)` : null,
  ].filter(Boolean);
  const body = included
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .map((page) => `--- p. ${page.pageNumber} ---\n${page.text}`);
  return [...header, ...body].join("\n");
}
