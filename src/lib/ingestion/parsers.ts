import type {
  DocumentFormat,
  DocumentMetadata,
  DocumentSection,
  ExtractionQuality,
  ParsedPage,
  ParserMethod,
} from "@/types/ingestion";
import { IngestionError } from "./errors";
import { parsePdfWithPdfJs } from "./pdfjs-parser";

/** What a parser produces. The pipeline adds source metadata and stats. */
export interface ParserOutput {
  title: string | null;
  text: string;
  sections: DocumentSection[];
  warnings: string[];
  pages?: ParsedPage[];
  metadata?: DocumentMetadata;
  parser?: ParserMethod | "text" | "markdown";
  extractionQuality?: ExtractionQuality;
}

/**
 * A parser turns raw bytes into normalized content. Parsers may be async
 * (binary formats usually are) and should throw `IngestionError` for
 * problems the user can fix.
 */
export type Parser = (bytes: Uint8Array) => ParserOutput | Promise<ParserOutput>;

/**
 * One parser per supported format. To add a format, add it to
 * `SUPPORTED_FORMATS` in `@/types/ingestion` and register its parser here.
 * TypeScript will report an error until both exist.
 */
export const parsers: Record<DocumentFormat, Parser> = {
  text: parsePlainText,
  markdown: parseMarkdown,
  pdf: parsePdfWithPdfJs,
};

function parsePlainText(bytes: Uint8Array): ParserOutput {
  const text = decodeUtf8(bytes);
  return {
    title: null,
    text,
    sections: [{ heading: null, level: 0, text: trimBlankLines(text) }],
    warnings: [],
  };
}

const HEADING = /^ {0,3}(#{1,6})[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Splits Markdown into sections on ATX headings (`#` to `######`). Lines
 * inside fenced code blocks are never treated as headings. This is
 * deliberately not a full Markdown parser; add a library only once a
 * feature needs rendered or structured Markdown.
 */
function parseMarkdown(bytes: Uint8Array): ParserOutput {
  const text = decodeUtf8(bytes);
  const warnings: string[] = [];
  const sections: DocumentSection[] = [];

  let current: { heading: string | null; level: number; lines: string[] } = {
    heading: null,
    level: 0,
    lines: [],
  };
  let openFence: string | null = null;

  const flush = () => {
    const body = trimBlankLines(current.lines.join("\n"));
    if (current.heading !== null || body !== "") {
      sections.push({
        heading: current.heading,
        level: current.level,
        text: body,
      });
    }
  };

  for (const line of text.split("\n")) {
    const fence = FENCE.exec(line)?.[1];
    if (fence) {
      if (openFence === null) openFence = fence[0];
      else if (fence[0] === openFence) openFence = null;
    }

    const heading = openFence === null && !fence ? HEADING.exec(line) : null;
    if (heading) {
      flush();
      current = { heading: heading[2], level: heading[1].length, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  flush();

  if (openFence !== null) {
    warnings.push(
      "A code block is never closed, so headings after it were not split into sections.",
    );
  }

  const title = sections.find((section) => section.level === 1)?.heading ?? null;
  return { title, text, sections, warnings };
}

/** Decodes strict UTF-8, strips the BOM, and normalizes line endings to `\n`. */
function decodeUtf8(bytes: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (cause) {
    throw new IngestionError("DECODE_FAILED", "The file is not valid UTF-8 text.", { cause });
  }
  if (text.includes("\u0000")) {
    throw new IngestionError("DECODE_FAILED", "The file appears to be binary, not text.");
  }
  return text.replace(/\r\n?/g, "\n");
}

function trimBlankLines(text: string): string {
  return text.replace(/^\s*\n/, "").trimEnd();
}
