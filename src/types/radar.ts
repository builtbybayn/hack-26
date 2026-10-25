import type { ApiResponse, CommonErrorCode } from "./api";

export interface ResearchContext {
  projectId: string;
  projectTitle: string;
  projectSummary: string;
  researchGoals: string[];
  keyConcepts: string[];
  researchQuestions: string[];
  knownChallenges: string[];
  constraints: string[];
  sourceDocumentIds: string[];
}

export interface SocialSource {
  platform: "x" | "reddit";
  url: string;
  publishedAt: string;
}

export interface ResearchPaper {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  doi?: string;
  url: string;
  abstract?: string;
  evidenceBasis: "abstract";
}

export type EvidenceStatus =
  | "supported"
  | "partially_supported"
  | "mixed"
  | "contradicted"
  | "insufficient_evidence"
  | "not_empirically_testable";
export type Feasibility = "high" | "moderate" | "low" | "unknown";
export type ProjectImpact =
  | "improvement_opportunity"
  | "potential_risk"
  | "alternative_approach"
  | "existing_related_work"
  | "further_investigation"
  | "no_significant_impact";
export type RadarRecommendation = "explore" | "prototype" | "monitor" | "avoid" | "no_action";

export interface ResearchClaim {
  text: string;
  kind: "empirical" | "theoretical" | "engineering" | "anecdote" | "speculative" | "opinion";
  conditions: string;
  status: EvidenceStatus;
  rationale: string;
  supportingPaperIds: string[];
  contradictingPaperIds: string[];
  limitations: string[];
  uncertainties: string[];
}

export interface ResearchFinding {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  discoveredAt: string;
  socialSources: SocialSource[];
  relevanceScore: number;
  claims: ResearchClaim[];
  papers: ResearchPaper[];
  feasibility: Feasibility;
  feasibilityExplanation: string;
  projectImpact: ProjectImpact;
  projectImpactExplanation: string;
  recommendation: RadarRecommendation;
  recommendedSteps: string[];
  uncertainties: string[];
}

export interface DeepDiveReport {
  findingId: string;
  createdAt: string;
  researchQuestion: string;
  originalClaim: string;
  papers: ResearchPaper[];
  supportingEvidence: string;
  contradictoryEvidence: string;
  feasibility: string;
  integrationStrategy: string;
  risksAndUnknowns: string[];
  suggestedExperiment: string;
  conclusion: string;
}

export interface ResearchScan {
  id: string;
  projectId: string;
  scannedAt: string;
  windowStart: string;
  contextSummary: string;
  sourcesSearched: string[];
  warnings: string[];
  findings: ResearchFinding[];
  usage?: { xPostsFetched: number; xSearchCalls: number };
  deepDives?: Record<string, DeepDiveReport>;
}

export type RadarResponse<T> = ApiResponse<
  T,
  CommonErrorCode | "RADAR_NOT_CONFIGURED" | "RADAR_PROVIDER_ERROR" | "RADAR_INVALID_RESPONSE"
>;
