import type { RecommendationsResponse } from "@/types/research";

/** MOCK DATA. Records copied from tests/fixtures/research/openalex.json. */
export const MOCK_RECOMMENDATIONS = {
  ok: true,
  data: {
    recommendations: [
      {
        paper: {
          id: "openalex:W47667379",
          title: "Fractional Vector Calculus",
          authors: ["Vasily Evgenevich Tarasov"],
          year: 2010,
          venue: "Nonlinear physical science",
          doi: "https://doi.org/10.1007/978-3-642-14003-7_11",
          url: "https://openalex.org/W47667379",
          citationCount: 132,
          provider: "openalex",
        },
        kind: "background",
        conceptIds: ["vector-calculus"],
        reason: null,
      },
      {
        paper: {
          id: "openalex:W2098940483",
          title: "Fractional vector calculus and fractional Maxwell’s equations",
          authors: ["Vasily Evgenevich Tarasov"],
          year: 2008,
          venue: "Annals of Physics",
          doi: "https://doi.org/10.1016/j.aop.2008.04.005",
          url: "https://openalex.org/W2098940483",
          openAccessPdfUrl: "https://arxiv.org/pdf/0907.2363",
          citationCount: 316,
          provider: "openalex",
        },
        kind: "related",
        conceptIds: [],
        reason: null,
      },
    ],
    queries: [{ text: "vector calculus", kind: "related", provider: "openalex", resultCount: 5 }],
    warnings: ["Mock recommendations; abstracts unavailable for 2 results."],
  },
} satisfies RecommendationsResponse;
