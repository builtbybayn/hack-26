import type { PdfStudyPreviewResponse } from "@/types/paper-preview";

export const MOCK_PDF_STUDY_PREVIEW = {
  ok: true,
  data: {
    fileName: "example-study.pdf",
    pageCount: 8,
    fields: {
      methods: { pageNumber: 2, quote: "We conducted a randomized trial with two study arms." },
      sample: { pageNumber: 2, quote: "The sample included 120 university students." },
      measures: null,
      results: { pageNumber: 5, quote: "Retention scores improved after six weeks." },
      limitations: null,
    },
    warnings: [],
  },
} satisfies PdfStudyPreviewResponse;
