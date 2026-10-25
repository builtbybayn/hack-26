import type { CitationReferencesResponse } from "@/types/research";

export const MOCK_CITATION_REFERENCES = {
  ok: true,
  data: { references: {} },
} satisfies CitationReferencesResponse;
