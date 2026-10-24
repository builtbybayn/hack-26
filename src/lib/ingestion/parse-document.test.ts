import { describe, expect, it } from "vitest";
import { shouldUseAdvancedOcr } from "./parse-document";

const poor = {
  score: 0.1,
  needsOcr: true,
  reasons: ["low text"],
  charactersPerPage: 3,
  readablePageRatio: 0,
};
const good = {
  score: 0.9,
  needsOcr: false,
  reasons: [],
  charactersPerPage: 900,
  readablePageRatio: 1,
};

describe("OCR fallback decision", () => {
  it("uses OCR for explicit advanced mode or poor automatic extraction", () => {
    expect(shouldUseAdvancedOcr("advanced", good)).toBe(true);
    expect(shouldUseAdvancedOcr("automatic", poor)).toBe(true);
  });

  it("never falls back in standard mode", () => {
    expect(shouldUseAdvancedOcr("standard", poor)).toBe(false);
    expect(shouldUseAdvancedOcr("automatic", good)).toBe(false);
  });
});
