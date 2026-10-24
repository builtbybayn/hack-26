import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type {
  DocumentMetadata,
  DocumentSection,
  ExtractionQuality,
  ParsedPage,
  TextPosition,
} from "@/types/ingestion";
import type { ParserOutput } from "./parsers";

interface PositionedItem extends TextPosition {
  fontSize: number;
}

export async function parsePdfWithPdfJs(bytes: Uint8Array): Promise<ParserOutput> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
  });
  const pdf = await task.promise;
  const pages: ParsedPage[] = [];
  const allItems: PositionedItem[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .filter((item): item is TextItem => "str" in item)
      .map((item) => ({
        text: item.str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
        height: item.height,
        fontName: item.fontName,
        fontSize: Math.abs(item.transform[3]) || item.height,
      }));
    allItems.push(...items);
    pages.push({ pageNumber, text: itemsToText(items), positions: items });
  }

  const rawMetadata = await pdf.getMetadata().catch(() => null);
  const info = (rawMetadata?.info ?? {}) as Record<string, unknown>;
  const metadata: DocumentMetadata = {
    pageCount: pdf.numPages,
    author: stringValue(info.Author),
    subject: stringValue(info.Subject),
    keywords: stringValue(info.Keywords)
      ?.split(/[,;]/)
      .map((value) => value.trim())
      .filter(Boolean),
    createdAt: parsePdfDate(stringValue(info.CreationDate)),
    modifiedAt: parsePdfDate(stringValue(info.ModDate)),
  };
  const title = stringValue(info.Title) ?? inferTitle(allItems);
  const text = pages.map((page) => page.text).join("\n\n");
  const sections = buildSections(pages, allItems, title);
  const extractionQuality = assessExtractionQuality(pages);
  await task.destroy();

  return {
    title,
    text,
    pages,
    sections,
    metadata,
    extractionQuality,
    parser: "standard",
    warnings: extractionQuality.needsOcr
      ? ["Local PDF extraction quality is low. Advanced OCR may improve this document."]
      : [],
  };
}

export function assessExtractionQuality(pages: Pick<ParsedPage, "text">[]): ExtractionQuality {
  const lengths = pages.map((page) => page.text.replace(/\s/g, "").length);
  const characters = lengths.reduce((sum, value) => sum + value, 0);
  const readable = lengths.filter((length) => length >= 40).length;
  const pageCount = Math.max(pages.length, 1);
  const charactersPerPage = characters / pageCount;
  const readablePageRatio = readable / pageCount;
  const reasons: string[] = [];
  if (charactersPerPage < 80) reasons.push("Very little selectable text was found per page.");
  if (readablePageRatio < 0.65) reasons.push("Many pages contain little or no readable text.");
  const suspiciousRatio =
    characters === 0
      ? 1
      : (pages
          .map((p) => p.text)
          .join("")
          .match(/[�□]/g)?.length ?? 0) / characters;
  if (suspiciousRatio > 0.02) reasons.push("The extracted text contains many undecodable glyphs.");
  const score = Math.max(
    0,
    Math.min(1, charactersPerPage / 500) * 0.55 +
      readablePageRatio * 0.4 +
      (suspiciousRatio < 0.02 ? 0.05 : 0),
  );
  return { score, needsOcr: reasons.length > 0, reasons, charactersPerPage, readablePageRatio };
}

function itemsToText(items: PositionedItem[]): string {
  const sorted = [...items].sort((a, b) => (Math.abs(a.y - b.y) > 3 ? b.y - a.y : a.x - b.x));
  const lines: { y: number; items: PositionedItem[] }[] = [];
  for (const item of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate.y - item.y) <= 3);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean)
    .join("\n");
}

function buildSections(
  pages: ParsedPage[],
  items: PositionedItem[],
  title: string | null,
): DocumentSection[] {
  if (pages.length === 0) return [];
  const sizes = items
    .map((item) => item.fontSize)
    .filter((size) => size > 0)
    .sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] ?? 12;
  return pages.map((page) => {
    const headingItem = (page.positions as PositionedItem[] | undefined)?.find(
      (item) =>
        item.text.trim().length > 2 &&
        item.text.trim().length < 120 &&
        item.fontSize >= median * 1.25,
    );
    return {
      id: `page-${page.pageNumber}`,
      heading: headingItem?.text.trim() ?? (page.pageNumber === 1 ? title : null),
      level: headingItem ? 2 : 0,
      text: page.text,
      pageNumbers: [page.pageNumber],
    };
  });
}

function inferTitle(items: PositionedItem[]): string | null {
  return (
    [...items]
      .filter((item) => item.text.trim().length >= 4 && item.text.trim().length <= 140)
      .sort((a, b) => b.fontSize - a.fontSize)[0]
      ?.text.trim() ?? null
  );
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsePdfDate(value?: string): string | undefined {
  if (!value) return undefined;
  const match = /^D:(\d{4})(\d{2})(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}
