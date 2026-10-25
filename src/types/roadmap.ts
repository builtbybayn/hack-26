/**
 * Research roadmap contract: from an idea to an ordered learning path of concepts and real papers.
 * The model plans the stages; papers come only from the scholarly provider (OpenAlex), never from
 * the model. Stateless: revisions send the previous roadmap and the conversation back.
 */
import type { ApiResponse, CommonErrorCode } from "./api";
import type { IntelligenceErrorCode } from "./intelligence";
import type { PaperRecord, ResearchErrorCode } from "./research";

export interface RoadmapConcept {
  name: string;
  /** Why it matters for the goal, in a sentence. */
  why: string;
}

export interface RoadmapStage {
  title: string;
  goal: string;
  concepts: RoadmapConcept[];
  /** The search used to find this stage's papers. */
  searchQuery: string;
  papers: PaperRecord[];
}

export interface Roadmap {
  /** Short name for the project folder. */
  projectName: string;
  /** What the user wants to be able to understand or do. */
  goal: string;
  summary: string;
  /** Ordered from foundations to the research frontier. */
  stages: RoadmapStage[];
  generatedAt: string;
}

export interface RoadmapTurn {
  role: "user" | "assistant";
  content: string;
}

export interface RoadmapRequest {
  idea: string;
  /** The roadmap to revise. Omit to create a new one. */
  previous?: Roadmap;
  /** Discussion so far when revising; the last turn is the user's new feedback. */
  conversation?: RoadmapTurn[];
}

export interface RoadmapResult {
  roadmap: Roadmap;
  /** A short note on what was planned or changed, shown in the conversation. */
  reply: string;
  warnings: string[];
}

export type RoadmapResponse = ApiResponse<
  RoadmapResult,
  IntelligenceErrorCode | ResearchErrorCode | CommonErrorCode
>;
