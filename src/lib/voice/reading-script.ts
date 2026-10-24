/**
 * Turns a parsed paper into a script that sounds natural when read aloud. Browser-safe and free:
 * no network, no credits. The server never sees the script; clients send one segment at a time.
 *
 * Raw PDF text is written for eyes, not ears. This removes running headers and page numbers,
 * rebuilds paragraphs from wrapped lines, skips the contents page and reference list, drops inline
 * citations, expands common abbreviations, and replaces equations and code with a short notice
 * pointing to the page where they can be seen.
 */
import type { ParsedDocument } from "@/types/ingestion";
import type { ReadingScript, ReadingSection, ReadingSegment } from "@/types/voice";

/** Long paragraphs are split at sentence boundaries above this length. */
export const MAX_SEGMENT_CHARACTERS = 1_000;
/** Short neighbouring paragraphs (list items) are merged below this length. */
const MERGE_BELOW_CHARACTERS = 300;
const MERGED_MAX_CHARACTERS = 600;
/** How much neighbouring text to send for smooth intonation across segments. */
const CONTEXT_CHARACTERS = 300;

type NonProseKind = "equation" | "code";

type Block =
  | { type: "heading"; major: boolean; text: string; page: number | null }
  | { type: "paragraph"; text: string; page: number | null }
  | { type: "nonprose"; kind: NonProseKind; page: number | null }
  | { type: "stop" };

interface SourceUnit {
  heading: string | null;
  /** True when `heading` also appears as a line inside `text` (PDF pages). */
  headingInText: boolean;
  lines: string[];
  page: number | null;
}

export function buildReadingScript(document: ParsedDocument): ReadingScript {
  const isPdf = document.format === "pdf";
  const units: SourceUnit[] = (
    document.sections.length
      ? document.sections.map((section) => ({
          heading: section.heading,
          text: section.text,
          page: section.pageNumbers?.[0] ?? null,
        }))
      : document.pages.map((page) => ({ heading: null, text: page.text, page: page.pageNumber }))
  ).map((unit) => ({
    heading: unit.heading?.trim() || null,
    headingInText: isPdf,
    lines: unit.text.split("\n").map((line) => line.trim()),
    page: unit.page,
  }));

  if (isPdf) removeRunningHeadersAndFooters(units);
  const vocabulary = new Set(document.text.toLowerCase().match(/\p{L}+(?:-\p{L}+)*/gu) ?? []);
  const blocks = toBlocks(units, isPdf, vocabulary);
  return assembleScript(document.id, blocks, isPdf);
}

/** Splits arbitrary text (an explanation, a note) into speakable segments. */
export function segmentText(text: string): ReadingSegment[] {
  return splitLongText(speakable(text)).map((chunk, index) => ({
    index,
    sectionIndex: 0,
    kind: "paragraph",
    text: chunk,
    pageNumber: null,
  }));
}

/** Neighbouring text for a segment, sent so intonation carries across segment boundaries. */
export function segmentContext(
  segments: ReadingSegment[],
  index: number,
): { previousText?: string; nextText?: string } {
  const previous = segments[index - 1]?.text;
  const next = segments[index + 1]?.text;
  return {
    previousText: previous ? previous.slice(-CONTEXT_CHARACTERS) : undefined,
    nextText: next ? next.slice(0, CONTEXT_CHARACTERS) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Pass 1: running headers, footers, and page numbers

const PAGE_NUMBER = /^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i;

function removeRunningHeadersAndFooters(units: SourceUnit[]): void {
  const edgeKey = (line: string) => line.toLowerCase().replace(/\d+/g, "#").trim();
  const edges = (lines: string[]) => {
    const content = lines.filter(Boolean);
    return [...content.slice(0, 3), ...content.slice(-3)];
  };

  const unitCounts = new Map<string, number>();
  for (const unit of units) {
    for (const key of new Set(edges(unit.lines).map(edgeKey))) {
      unitCounts.set(key, (unitCounts.get(key) ?? 0) + 1);
    }
  }
  const threshold = Math.max(3, Math.ceil(units.length * 0.3));
  const repeated = new Set(
    [...unitCounts].filter(([key, count]) => key && count >= threshold).map(([key]) => key),
  );

  for (const unit of units) {
    const edgeLines = new Set(edges(unit.lines));
    unit.lines = unit.lines.filter(
      (line) => !PAGE_NUMBER.test(line) && !(edgeLines.has(line) && repeated.has(edgeKey(line))),
    );
  }
}

// ---------------------------------------------------------------------------
// Pass 2: lines → blocks (headings, paragraphs, equations/code)

const REFERENCES_HEADING =
  /^((\d+|[IVX]+)\.?\s+)?(references|bibliography|works cited|literature cited)$/i;
const CONTENTS_HEADING = /^(table of )?contents$/i;
const SUBHEADING = /^(\d+(\.\d+)+|[A-Z](\.\d+)+)\.?\s+\S/;
/** "02 Users, jobs and principles": numbered, short, and not a sentence (list items are). */
const NUMBERED_HEADING = /^\d{1,2}\s+\p{Lu}/u;
const LIST_ITEM = /^(\d{1,2}[.)]|0\d|[•▪◦●\-–]|\([a-z0-9]\))\s+/;
const SENTENCE_END = /[.!?]["”’)]?$/;
const FENCE = /^(```|~~~)/;

type Line =
  | { type: "blank" }
  | { type: "heading"; major: boolean; text: string; page: number | null }
  | { type: "nonprose"; kind: NonProseKind; page: number | null }
  | { type: "prose"; text: string; page: number | null; shortLine: boolean }
  | { type: "stop" };

function toBlocks(units: SourceUnit[], isPdf: boolean, vocabulary: Set<string>): Block[] {
  const lines = classifyLines(units, isPdf);
  const blocks: Block[] = [];
  let paragraph: { lines: string[]; page: number | null } | null = null;

  const flush = () => {
    if (paragraph?.lines.length) {
      blocks.push({
        type: "paragraph",
        text: joinLines(paragraph.lines, vocabulary),
        page: paragraph.page,
      });
    }
    paragraph = null;
  };

  for (const line of lines) {
    if (line.type === "prose") {
      if (paragraph && LIST_ITEM.test(line.text)) flush();
      paragraph ??= { lines: [], page: line.page };
      paragraph.lines.push(line.text);
      if (line.shortLine && SENTENCE_END.test(line.text)) flush();
      continue;
    }
    flush();
    if (line.type === "blank") continue;
    if (line.type === "nonprose") {
      const previous = blocks.at(-1);
      // A run of equation or code lines becomes a single notice.
      if (previous?.type === "nonprose" && previous.kind === line.kind) continue;
      blocks.push(line);
      continue;
    }
    blocks.push(line);
    if (line.type === "stop") break;
  }
  flush();
  return blocks;
}

function classifyLines(units: SourceUnit[], isPdf: boolean): Line[] {
  const result: Line[] = [];
  let inFence = false;

  for (const unit of units) {
    if (unit.heading && !unit.headingInText) {
      if (REFERENCES_HEADING.test(unit.heading)) return [...result, { type: "stop" }];
      result.push({ type: "heading", major: true, text: unit.heading, page: unit.page });
    }
    const proseLengths = unit.lines.filter((line) => line.length > 20).map((line) => line.length);
    const typicalLength = median(proseLengths) ?? 80;
    let headingSeen = false;

    for (const line of unit.lines) {
      if (FENCE.test(line)) {
        inFence = !inFence;
        result.push({ type: "nonprose", kind: "code", page: unit.page });
        continue;
      }
      if (inFence) {
        result.push({ type: "nonprose", kind: "code", page: unit.page });
        continue;
      }
      if (!line) {
        result.push({ type: "blank" });
        continue;
      }
      if (REFERENCES_HEADING.test(line)) return [...result, { type: "stop" }];

      const isMajorHeading = unit.headingInText && !headingSeen && line === unit.heading;
      if (isMajorHeading) {
        headingSeen = true;
        result.push({ type: "heading", major: true, text: line, page: unit.page });
        continue;
      }
      const looksLikeHeading =
        (SUBHEADING.test(line) && line.length <= 90) ||
        (NUMBERED_HEADING.test(line) && line.length <= 70 && !/[.!?] /.test(line));
      if (looksLikeHeading && !/[.;:,]$/.test(line)) {
        result.push({ type: "heading", major: false, text: line, page: unit.page });
        continue;
      }
      const kind = nonProseKind(line, isPdf);
      if (kind) {
        result.push({ type: "nonprose", kind, page: unit.page });
        continue;
      }
      result.push({
        type: "prose",
        text: line,
        page: unit.page,
        shortLine: line.length < typicalLength * 0.8,
      });
    }
  }

  // A prose line sandwiched between two equation/code lines of the same kind belongs to them
  // (e.g. `pageIndex?: number; // viewer page, if verified` inside a type definition).
  for (let index = 1; index < result.length - 1; index += 1) {
    const [before, line, after] = [result[index - 1], result[index], result[index + 1]];
    if (
      line.type === "prose" &&
      before.type === "nonprose" &&
      after.type === "nonprose" &&
      before.kind === after.kind
    ) {
      result[index] = { type: "nonprose", kind: before.kind, page: line.page };
    }
  }
  return result;
}

const MATH_SYMBOLS = /[=+×÷±∑∏∫∂∇√∞≤≥≈≠∝∈∉⊂⊆∀∃→←↔^_]/g;
const GREEK = /[Ͱ-Ͽ]/g;
const LATEX_COMMAND =
  /\\(frac|sum|int|prod|alpha|beta|gamma|delta|theta|lambda|sigma|mu|mathbf|mathrm|left|right|cdot|partial|nabla|sqrt)\b/;
const CODE_KEYWORD =
  /^(type|interface|const|let|var|function|import|export|return|class|def|if|for|while)\b/;

function nonProseKind(line: string, isPdf: boolean): NonProseKind | null {
  if (
    /^[{}()[\];,]+$/.test(line) ||
    (/[;{}]$/.test(line) && (/^[\w$]+\??\s*[:=(]/.test(line) || CODE_KEYWORD.test(line)))
  ) {
    return "code";
  }
  if (LATEX_COMMAND.test(line) || (isPdf && /^\(\d{1,3}\)$/.test(line))) return "equation";
  const words = line.match(/[A-Za-z]{3,}/g)?.length ?? 0;
  const symbols = (line.match(MATH_SYMBOLS)?.length ?? 0) + (line.match(GREEK)?.length ?? 0);
  if ((symbols >= 2 && words <= 2) || (symbols >= 4 && words < symbols)) return "equation";
  return null;
}

/**
 * Joins wrapped lines. A line ending in a hyphen is either a compound split at the line end
 * ("team-" + "named") or a word broken for justification ("analy-" + "sis"). The rest of the
 * paper decides: whichever form appears elsewhere wins; unknown cases keep the hyphen.
 */
function joinLines(lines: string[], vocabulary: Set<string>): string {
  return lines.reduce((joined, line) => {
    if (!joined) return line;
    const before = /(\p{L}+)-$/u.exec(joined)?.[1];
    const after = /^(\p{Ll}+)/u.exec(line)?.[1];
    if (before && after) {
      const compound = `${before}-${after}`.toLowerCase();
      const word = `${before}${after}`.toLowerCase();
      const isWordBreak = !vocabulary.has(compound) && vocabulary.has(word);
      return isWordBreak ? `${joined.slice(0, -1)}${line}` : `${joined}${line}`;
    }
    return `${joined} ${line}`;
  }, "");
}

// ---------------------------------------------------------------------------
// Pass 3: blocks → sections and segments

function assembleScript(documentId: string, blocks: Block[], isPdf: boolean): ReadingScript {
  const sections: ReadingSection[] = [];
  const segments: ReadingSegment[] = [];
  let skippingSection = false;

  const startSection = (heading: string | null) => {
    sections.push({
      index: sections.length,
      heading,
      firstSegmentIndex: segments.length,
      segmentCount: 0,
      characterCount: 0,
    });
  };
  const addSegment = (kind: ReadingSegment["kind"], text: string, page: number | null) => {
    if (!text) return;
    if (!sections.length) startSection(null);
    const section = sections[sections.length - 1];
    const previous = segments.at(-1);
    const canMerge =
      kind === "paragraph" &&
      previous?.kind === "paragraph" &&
      previous.sectionIndex === section.index &&
      previous.text.length < MERGE_BELOW_CHARACTERS &&
      previous.text.length + text.length < MERGED_MAX_CHARACTERS;
    if (canMerge) {
      previous.text = `${previous.text}\n${text}`;
      section.characterCount += text.length + 1;
      return;
    }
    for (const chunk of kind === "paragraph" ? splitLongText(text) : [text]) {
      segments.push({
        index: segments.length,
        sectionIndex: section.index,
        kind,
        text: chunk,
        pageNumber: page,
      });
      section.segmentCount += 1;
      section.characterCount += chunk.length;
    }
  };

  for (const block of blocks) {
    if (block.type === "heading" && block.major) {
      skippingSection = CONTENTS_HEADING.test(block.text);
      if (skippingSection) continue;
      const heading = spokenHeading(block.text);
      startSection(heading);
      addSegment("heading", heading, block.page);
      continue;
    }
    if (skippingSection) continue;
    if (block.type === "heading") addSegment("heading", spokenHeading(block.text), block.page);
    else if (block.type === "paragraph") addSegment("paragraph", speakable(block.text), block.page);
    else if (block.type === "nonprose")
      addSegment("notice", nonProseNotice(block, isPdf), block.page);
    else if (block.type === "stop") {
      addSegment("notice", "The reference list is not read aloud.", null);
    }
  }

  return {
    documentId,
    sections: sections.filter((section) => section.segmentCount > 0),
    segments,
    characterCount: segments.reduce((sum, segment) => sum + segment.text.length, 0),
  };
}

function nonProseNotice(block: { kind: NonProseKind; page: number | null }, isPdf: boolean) {
  const what = block.kind === "equation" ? "An equation" : "A code listing";
  const where =
    isPdf && block.page ? `on page ${block.page} of the PDF` : "in the original document";
  return `${what} appears here. You can view it ${where}.`;
}

// ---------------------------------------------------------------------------
// Text cleanup for listening

const ABBREVIATIONS: [RegExp, string][] = [
  [/\be\.g\.,?/gi, "for example,"],
  [/\bi\.e\.,?/gi, "that is,"],
  [/\bet al\./g, "and colleagues"],
  [/\bFigs\.\s*/g, "Figures "],
  [/\bFig\.\s*/g, "Figure "],
  [/\bEqs\.\s*/g, "Equations "],
  [/\bEq\.\s*/g, "Equation "],
  [/\bSecs?\.\s*/g, "Section "],
  [/\bvs\.\s*/g, "versus "],
  [/\bcf\.\s*/g, "compare "],
  [/\bapprox\.\s*/g, "approximately "],
  [/\bw\.r\.t\.\s*/g, "with respect to "],
  [/\bpp\.\s*(?=\d)/g, "pages "],
  [/\bp\.\s*(?=\d)/g, "page "],
];

/** Cleans prose for listening. Exported for tests. */
export function speakable(text: string): string {
  let spoken = text
    // Bracketed citations: [12], [3–5], [S4, p. 2].
    .replace(/\s*\[[^\][]{0,60}\d[^\][]{0,60}\]/g, "")
    // Parenthetical author-year citations: (Smith, 2020), (Lee et al., 2019; Kim & Park, 2021).
    .replace(
      /\s*\((?:see\s+)?(?:[A-Z][\p{L}'’-]+(?:\s+(?:et al\.|and|&)(?:\s+[A-Z][\p{L}'’-]+)?)?,?\s+\d{4}[a-z]?(?:;\s*)?)+\)/gu,
      "",
    )
    // URLs are unreadable aloud; drop them along with separators left between them.
    .replace(/\s*(?:https?:\/\/|www\.)\S*[^\s.,;:!?)"”’]/g, "")
    .replace(/(^|\s)\|(?=\s|$)/g, "")
    .replace(/\s*→\s*/g, ", then ")
    .replace(/^[•▪◦●]\s*/, "")
    .replace(/^0(\d)\s+/, "$1. ");
  for (const [pattern, replacement] of ABBREVIATIONS) spoken = spoken.replace(pattern, replacement);
  return spoken
    .replace(/[ \t]+/g, " ")
    .replace(/ ([,.;:!?])/g, "$1")
    .replace(/,([,.;:])/g, "$1")
    .replace(/:([.;])/g, "$1")
    .trim();
}

function spokenHeading(text: string): string {
  return speakable(text.replace(/^(\d+(\.\d+)*)\.?\s+/, ""));
}

function splitLongText(text: string): string[] {
  if (text.length <= MAX_SEGMENT_CHARACTERS) return text ? [text] : [];
  const sentences = text.split(/(?<=[.!?]["”’)]?)\s+(?=["“(]?[A-Z0-9])/);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    for (const piece of hardWrap(sentence)) {
      if (current && current.length + piece.length + 1 > MAX_SEGMENT_CHARACTERS) {
        chunks.push(current);
        current = "";
      }
      current = current ? `${current} ${piece}` : piece;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function hardWrap(sentence: string): string[] {
  const pieces: string[] = [];
  let rest = sentence;
  while (rest.length > MAX_SEGMENT_CHARACTERS) {
    const cut = rest.lastIndexOf(" ", MAX_SEGMENT_CHARACTERS);
    const at = cut > 0 ? cut : MAX_SEGMENT_CHARACTERS;
    pieces.push(rest.slice(0, at));
    rest = rest.slice(at).trimStart();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}
