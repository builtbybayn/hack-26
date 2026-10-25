/**
 * BibTeX citations for workspace sources, from the metadata we have (title, authors, year, venue,
 * URL). Missing fields are left out rather than invented.
 */
import type { Document } from "./models";

/** Characters that BibTeX treats specially inside a field value. */
const SPECIAL = /([&%$#_])/g;

function escapeValue(value: string): string {
  return value
    .replace(/[{}\\]/g, "")
    .replace(SPECIAL, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** Organizations ("Research Twin project working draft") are cited whole, not split into names. */
function isOrganization(author: string): boolean {
  const trimmed = author.trim();
  return !trimmed.includes(",") && trimmed.split(/\s+/).length >= 4;
}

function formatAuthor(author: string): string {
  const value = escapeValue(author);
  return value && isOrganization(author) ? `{${value}}` : value;
}

function lastName(author: string): string {
  const trimmed = author.trim();
  // "Lovelace, Ada" lists the family name first.
  if (trimmed.includes(",")) return trimmed.split(",")[0].trim();
  if (isOrganization(trimmed)) return trimmed.split(/\s+/)[0];
  return trimmed.split(/\s+/).at(-1) ?? "";
}

const STOP_WORDS = new Set(["a", "an", "the", "on", "of", "in", "for", "and", "to", "with"]);

/** A citation key like `vaswani2017attention`. */
export function citationKey(document: Pick<Document, "title" | "authors" | "year">): string {
  const simple = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]/gu, "")
      .toLowerCase();
  const author = simple(lastName(document.authors[0] ?? ""));
  const word =
    document.title
      .split(/\s+/)
      .map(simple)
      .find((item) => item && !STOP_WORDS.has(item)) ?? "source";
  return `${author || word}${document.year ?? "nd"}${author ? word : ""}`;
}

export function toBibtex(
  document: Pick<Document, "title" | "authors" | "year" | "venue" | "url" | "kind">,
): string {
  const doi = document.url?.match(/doi\.org\/(10\.[^\s?#]+)/i)?.[1];
  const type = document.venue ? "article" : "misc";
  const fields: [string, string | undefined][] = [
    // Double braces keep the title's capitalization.
    ["title", `{${escapeValue(document.title)}}`],
    ["author", document.authors.map(formatAuthor).filter(Boolean).join(" and ") || undefined],
    ["year", document.year ? String(document.year) : undefined],
    [
      type === "article" ? "journal" : "howpublished",
      document.venue ? escapeValue(document.venue) : undefined,
    ],
    ["doi", doi],
    ["url", !doi && document.url ? document.url : undefined],
  ];
  const body = fields
    .filter((field): field is [string, string] => Boolean(field[1]))
    .map(([name, value]) => `  ${name} = {${value}}`)
    .join(",\n");
  return `@${type}{${citationKey(document)},\n${body}\n}`;
}

/** Copies text, falling back to a hidden textarea where the Clipboard API is unavailable. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    // Not allowed here (e.g. no focus or an insecure context): use the legacy path below.
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  const copied = document.execCommand("copy");
  area.remove();
  if (!copied) throw new Error("Couldn't copy to the clipboard.");
}
