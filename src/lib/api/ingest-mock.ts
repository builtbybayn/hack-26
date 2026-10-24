/**
 * MOCK DATA, not real backend output.
 *
 * Sample `IngestResponse` payloads so frontend work can proceed without a
 * running backend. They are type-checked against the real contract, so they
 * break at compile time if the contract changes. Anything rendered from
 * these must be visibly labeled as mock data.
 */
import type { IngestResponse } from "@/types/ingestion";

const MOCK_TEXT = `# Quarterly field notes

A short sample document used to design against the ingestion contract.

## Observations

Three sites reported delays caused by incomplete intake forms.

## Next steps

Standardize the intake template before the next review.
`;

export const MOCK_INGEST_SUCCESS = {
  ok: true,
  data: {
    format: "markdown",
    source: {
      fileName: "mock-field-notes.md",
      mimeType: "text/markdown",
      sizeBytes: 249,
    },
    title: "Quarterly field notes",
    text: MOCK_TEXT,
    sections: [
      {
        heading: "Quarterly field notes",
        level: 1,
        text: "A short sample document used to design against the ingestion contract.",
      },
      {
        heading: "Observations",
        level: 2,
        text: "Three sites reported delays caused by incomplete intake forms.",
      },
      {
        heading: "Next steps",
        level: 2,
        text: "Standardize the intake template before the next review.",
      },
    ],
    stats: { characters: 249, words: 37, lines: 11 },
    warnings: [],
    parsedAt: "2026-01-01T00:00:00.000Z",
  },
} satisfies IngestResponse;

export const MOCK_INGEST_ERROR = {
  ok: false,
  error: {
    code: "UNSUPPORTED_FORMAT",
    message: "Unsupported file type. Accepted: .txt, .text, .md, .markdown.",
  },
} satisfies IngestResponse;
