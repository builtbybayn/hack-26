import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { MOCK_INGEST_SUCCESS } from "@/lib/api/ingest-mock";
import { MAX_FILE_BYTES } from "@/types/ingestion";
import { ingest, ingestFile, IngestionError } from "./index";
import { detectFormat } from "./validate";

const encode = (text: string) => new TextEncoder().encode(text);

async function expectIngestionError(promise: Promise<unknown>, code: IngestionError["code"]) {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(IngestionError);
  expect((error as IngestionError).code).toBe(code);
}

describe("detectFormat", () => {
  it("prefers the extension over a generic MIME type", () => {
    expect(detectFormat("notes.MD", "application/octet-stream")).toBe("markdown");
    expect(detectFormat("notes.txt", "")).toBe("text");
  });

  it("falls back to the MIME type, ignoring parameters", () => {
    expect(detectFormat("notes", "text/markdown; charset=utf-8")).toBe("markdown");
  });

  it("returns null for unsupported files", () => {
    expect(detectFormat("report.pdf", "application/pdf")).toBeNull();
  });
});

describe("ingest", () => {
  it("parses plain text into one untitled section with stats", async () => {
    const doc = await ingest({
      fileName: "hello.txt",
      mimeType: "text/plain",
      bytes: encode("﻿Hello there,\r\nworld.\r\n"),
    });

    expect(doc.format).toBe("text");
    expect(doc.title).toBeNull();
    expect(doc.text).toBe("Hello there,\nworld.\n");
    expect(doc.sections).toEqual([{ heading: null, level: 0, text: "Hello there,\nworld." }]);
    expect(doc.stats).toEqual({ characters: 20, words: 3, lines: 2 });
    expect(doc.source.sizeBytes).toBe(25);
  });

  it("splits Markdown on headings but not inside code fences", async () => {
    const bytes = await readFile(new URL("../../../tests/fixtures/sample.md", import.meta.url));
    const doc = await ingest({ fileName: "sample.md", mimeType: "", bytes });

    expect(doc.format).toBe("markdown");
    expect(doc.title).toBe("Sample document");
    expect(doc.sections.map((s) => [s.level, s.heading])).toEqual([
      [1, "Sample document"],
      [2, "Code is not split"],
      [2, "Last section"],
    ]);
    expect(doc.sections[1].text).toContain("# This heading is inside a code block");
    expect(doc.warnings).toEqual([]);
  });

  it("keeps content before the first heading as an untitled section", async () => {
    const doc = await ingest({
      fileName: "intro.md",
      mimeType: "",
      bytes: encode("Preamble.\n\n## Part one ##\nBody."),
    });
    expect(doc.title).toBeNull();
    expect(doc.sections).toEqual([
      { heading: null, level: 0, text: "Preamble." },
      { heading: "Part one", level: 2, text: "Body." },
    ]);
  });

  it("warns about an unclosed code fence", async () => {
    const doc = await ingest({
      fileName: "broken.md",
      mimeType: "",
      bytes: encode("# Title\n```\n# not a heading"),
    });
    expect(doc.sections).toHaveLength(1);
    expect(doc.warnings).toHaveLength(1);
  });

  it("rejects empty, oversized, unsupported, and binary files", async () => {
    const input = { fileName: "a.txt", mimeType: "text/plain" };
    await expectIngestionError(ingest({ ...input, bytes: new Uint8Array() }), "EMPTY_FILE");
    await expectIngestionError(ingest({ ...input, bytes: encode("  \n\t ") }), "EMPTY_FILE");
    await expectIngestionError(
      ingest({ ...input, bytes: new Uint8Array(MAX_FILE_BYTES + 1) }),
      "FILE_TOO_LARGE",
    );
    await expectIngestionError(
      ingest({
        fileName: "a.pdf",
        mimeType: "application/pdf",
        bytes: encode("%PDF"),
      }),
      "UNSUPPORTED_FORMAT",
    );
    await expectIngestionError(
      ingest({ ...input, bytes: new Uint8Array([0xff, 0xfe, 0x00]) }),
      "DECODE_FAILED",
    );
    await expectIngestionError(ingest({ ...input, bytes: encode("a\u0000b") }), "DECODE_FAILED");
  });
});

describe("ingestFile", () => {
  it("accepts a Web File", async () => {
    const file = new File(["# From a File"], "upload.md", {
      type: "text/markdown",
    });
    const doc = await ingestFile(file);
    expect(doc.title).toBe("From a File");
    expect(doc.source).toEqual({
      fileName: "upload.md",
      mimeType: "text/markdown",
      sizeBytes: 13,
    });
  });
});

describe("mock payload", () => {
  it("matches what the real pipeline produces for the same text", async () => {
    const mock = MOCK_INGEST_SUCCESS.data;
    const real = await ingest({
      fileName: mock.source.fileName,
      mimeType: mock.source.mimeType,
      bytes: encode(mock.text),
    });
    expect({ ...real, parsedAt: mock.parsedAt }).toEqual(mock);
  });
});
