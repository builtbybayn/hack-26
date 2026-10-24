import { describe, expect, it } from "vitest";
import { assessExtractionQuality, parsePdfWithPdfJs } from "./pdfjs-parser";

describe("PDF.js extraction", () => {
  it("extracts page text, metadata, and page references without layout data", async () => {
    const result = await parsePdfWithPdfJs(makePdf("Maxwell Equations"));
    expect(result.pages).toHaveLength(1);
    expect(result.pages?.[0].text).toContain("Maxwell Equations");
    expect(result.pages?.[0]).toEqual({ pageNumber: 1, text: expect.any(String) });
    expect(result.metadata?.pageCount).toBe(1);
    expect(result.sections[0].pageNumbers).toEqual([1]);
  });

  it("flags scanned or image-heavy pages for OCR", () => {
    const quality = assessExtractionQuality([{ text: "" }, { text: "tiny" }, { text: "" }]);
    expect(quality.needsOcr).toBe(true);
    expect(quality.readablePageRatio).toBe(0);
  });
});

function makePdf(text: string): Uint8Array {
  const content = `BT /F1 24 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n `)
    .join(
      "\n",
    )}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
