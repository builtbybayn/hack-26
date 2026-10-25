import { z } from "zod";

const short = (max: number) => z.string().trim().min(1).max(max);
const list = (maxItems: number, maxLength = 160) => z.array(short(maxLength)).max(maxItems);

export const contextSchema = z.object({
  projectId: short(120),
  projectTitle: short(160),
  projectSummary: short(2_000),
  researchGoals: list(8),
  keyConcepts: list(16),
  researchQuestions: list(8, 300),
  knownChallenges: list(8, 300),
  constraints: list(8, 300),
  sourceDocumentIds: list(30, 120),
});

export const scanRequestSchema = z.object({ context: contextSchema, consent: z.literal(true) });

export const candidateSchema = z.object({
  url: z.string().url(),
  title: short(160),
  summary: short(500),
  claim: short(400),
  kind: z.enum(["empirical", "theoretical", "engineering", "anecdote", "speculative", "opinion"]),
  conditions: z.string().trim().max(300),
});

export const discoverySchema = z.object({ candidates: z.array(candidateSchema).max(20) });

export const assessmentSchema = z.object({
  status: z.enum([
    "supported",
    "partially_supported",
    "mixed",
    "contradicted",
    "insufficient_evidence",
    "not_empirically_testable",
  ]),
  rationale: short(700),
  supportingPaperIds: list(6, 100),
  contradictingPaperIds: list(6, 100),
  limitations: list(5, 300),
  uncertainties: list(5, 300),
  feasibility: z.enum(["high", "moderate", "low", "unknown"]),
  feasibilityExplanation: short(700),
  projectImpact: z.enum([
    "improvement_opportunity",
    "potential_risk",
    "alternative_approach",
    "existing_related_work",
    "further_investigation",
    "no_significant_impact",
  ]),
  projectImpactExplanation: short(700),
  recommendation: z.enum(["explore", "prototype", "monitor", "avoid", "no_action"]),
  recommendedSteps: list(5, 300),
});

export const deepDiveAnalysisSchema = z.object({
  researchQuestion: short(300),
  supportingEvidence: short(1_200),
  contradictoryEvidence: short(1_200),
  feasibility: short(1_000),
  integrationStrategy: short(1_000),
  risksAndUnknowns: list(7, 300),
  suggestedExperiment: short(1_000),
  conclusion: short(800),
});

export const deepDiveRequestSchema = z.object({
  context: contextSchema,
  finding: z.object({
    id: short(120),
    projectId: short(120),
    title: short(160),
    claim: short(400),
    sourceUrl: z.string().url(),
    publishedAt: z.string().datetime(),
  }),
  consent: z.literal(true),
});
