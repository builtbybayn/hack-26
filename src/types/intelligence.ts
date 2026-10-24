import type { ApiResponse, CommonErrorCode } from "./api";
import type { ParsedDocument } from "./ingestion";

export interface SourceReference {
  pageNumber: number;
  sectionId?: string;
  quote?: string;
}

export interface Concept {
  id: string;
  name: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  sourceReferences: SourceReference[];
}

export interface Dependency {
  prerequisiteId: string;
  dependentId: string;
  evidenceType: "source" | "inferred";
  rationale: string;
}

export interface KnowledgeGraph {
  documentId: string;
  concepts: Concept[];
  dependencies: Dependency[];
}

export interface GraphRepair {
  type: "duplicate" | "invalid-reference" | "cycle";
  message: string;
}

export interface ValidatedGraph extends KnowledgeGraph {
  topologicalOrder: string[];
  foundationalConceptIds: string[];
  downstreamCounts: Record<string, number>;
  repairs: GraphRepair[];
}

export interface DocumentUnderstanding {
  subject: string;
  topics: string[];
  terminology: string[];
  equations: string[];
  definitions: string[];
  learningObjectives: string[];
}

export type MasteryLevel = "unknown" | "learning" | "mastered";

export interface LearningPathItem {
  conceptId: string;
  priority: number;
  reason: string;
  blockedConceptCount: number;
}

export interface DocumentAnalysis {
  understanding: DocumentUnderstanding;
  graph: ValidatedGraph;
  learningPath: LearningPathItem[];
}

export interface ParseOptions {
  mode?: "automatic" | "standard" | "advanced";
  ocrProvider?: "mistral" | "mathpix";
  allowExternalProcessing?: boolean;
}

export type PipelineStage =
  | "extracting"
  | "ocr"
  | "concepts"
  | "prerequisites"
  | "validating"
  | "learning-path"
  | "completed"
  | "failed";

export interface ParseDocumentResult {
  document: ParsedDocument;
  cacheHit: boolean;
}

export interface AnalyzeRequest {
  documentId: string;
  mastery?: Record<string, MasteryLevel>;
}

export interface AnalyzeDocumentResult {
  analysis: DocumentAnalysis;
  cacheHit: boolean;
}

export interface ExplainRequest {
  documentId: string;
  conceptId: string;
  style: "beginner" | "technical" | "analogy" | "worked-example";
  question?: string;
}

export interface ExplainResult {
  explanation: string;
  sourceReferences: SourceReference[];
}

export interface QuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
}

export interface QuizResult {
  conceptId: string;
  questions: QuizQuestion[];
}

export interface EvaluateRequest {
  documentId: string;
  conceptId: string;
  answers: Record<string, string>;
}

export interface EvaluateResult {
  score: number;
  passed: boolean;
  feedback: string;
  mastery: MasteryLevel;
}

export type IntelligenceErrorCode =
  | "DOCUMENT_NOT_FOUND"
  | "CONCEPT_NOT_FOUND"
  | "CONSENT_REQUIRED"
  | "OCR_NOT_CONFIGURED"
  | "AI_NOT_CONFIGURED"
  | "PROVIDER_ERROR"
  | "MODEL_RESPONSE_INVALID"
  | "REQUEST_TIMEOUT";

export type ParseDocumentResponse = ApiResponse<
  ParseDocumentResult,
  IntelligenceErrorCode | CommonErrorCode | import("./ingestion").IngestionErrorCode
>;
export type AnalyzeDocumentResponse = ApiResponse<
  AnalyzeDocumentResult,
  IntelligenceErrorCode | CommonErrorCode
>;
export type GetDocumentResponse = ApiResponse<
  ParsedDocument,
  IntelligenceErrorCode | CommonErrorCode
>;
export type ExplainResponse = ApiResponse<ExplainResult, IntelligenceErrorCode | CommonErrorCode>;
export type QuizResponse = ApiResponse<QuizResult, IntelligenceErrorCode | CommonErrorCode>;
export type EvaluateResponse = ApiResponse<EvaluateResult, IntelligenceErrorCode | CommonErrorCode>;
