import type { RoadmapResponse } from "@/types/roadmap";

/** MOCK DATA for building roadmap UI without Gemini. Paper records copied from research-mock. */
export const MOCK_ROADMAP_RESPONSE = {
  ok: true,
  data: {
    reply: "I planned three stages, from vector calculus up to fractional field theories.",
    warnings: [],
    roadmap: {
      projectName: "Fractional Field Theory",
      goal: "Understand how fractional calculus extends classical electromagnetism.",
      summary:
        "Start with vector calculus, then fractional derivatives, then their use in Maxwell's equations.",
      generatedAt: "2026-10-24T00:00:00.000Z",
      stages: [
        {
          title: "Vector calculus foundations",
          goal: "Be fluent with gradient, divergence, and curl.",
          concepts: [{ name: "Divergence theorem", why: "Links field sources to fluxes." }],
          searchQuery: "vector calculus fundamentals",
          papers: [
            {
              id: "openalex:W47667379",
              title: "Fractional Vector Calculus",
              authors: ["Vasily Evgenevich Tarasov"],
              year: 2010,
              url: "https://openalex.org/W47667379",
              provider: "openalex",
            },
          ],
        },
        {
          title: "Fractional Maxwell equations",
          goal: "Read current work on fractional electrodynamics.",
          concepts: [{ name: "Fractional derivative", why: "The operator being generalized." }],
          searchQuery: "fractional Maxwell equations",
          papers: [],
        },
      ],
    },
  },
} satisfies RoadmapResponse;
