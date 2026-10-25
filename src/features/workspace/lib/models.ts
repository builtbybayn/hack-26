export type ID = string;
export type Section =
  | "overview"
  | "library"
  | "reader"
  | "roadmap"
  | "evidence"
  | "notes"
  | "writing"
  | "extension"
  | "graph";
export type SourceKind = "article" | "pdf" | "note" | "link";
export type ProcessingState = "uploading" | "processing" | "ready" | "failed";
export type ReviewState = "inferred" | "confirmed" | "needs-review";

export interface Project {
  id: ID;
  name: string;
  description: string;
  updatedAt: string;
}
export interface SourceLocation {
  documentId: ID;
  page?: number;
  passageId?: ID;
  quote?: string;
  start?: number;
  end?: number;
}
export interface Passage {
  id: ID;
  heading?: string;
  text: string;
  page?: number;
}
export interface Document {
  id: ID;
  projectId: ID;
  title: string;
  kind: SourceKind;
  authors: string[];
  year?: number;
  venue?: string;
  url?: string;
  tags: string[];
  status: ProcessingState;
  reading: "unread" | "reading" | "read";
  addedAt: string;
  summary: string;
  passages: Passage[];
  demo?: boolean;
  fileData?: string;
  progress?: number;
  error?: string;
}
export interface Annotation {
  id: ID;
  projectId: ID;
  location: SourceLocation;
  kind: "highlight" | "note" | "question";
  text: string;
  createdAt: string;
}
export interface Note {
  id: ID;
  projectId: ID;
  title: string;
  body: string;
  location?: SourceLocation;
  conceptId?: ID;
  findingId?: ID;
  question: boolean;
  resolved: boolean;
  updatedAt: string;
}
export interface Concept {
  id: ID;
  projectId: ID;
  name: string;
  why: string;
  refresher: string;
  requires: ID[];
  location: SourceLocation;
  status: "to-learn" | "learning" | "understood";
  origin: ReviewState;
  order: number;
}
export interface Assumption {
  id: ID;
  text: string;
  location: SourceLocation;
}
export interface Claim {
  id: ID;
  projectId: ID;
  text: string;
  location: SourceLocation;
  assumptions: Assumption[];
}
export type EvidenceType =
  "supporting" | "potential-contradiction" | "different-conditions" | "insufficient";
export interface EvidenceFinding {
  id: ID;
  projectId: ID;
  claimId: ID;
  type: EvidenceType;
  related: SourceLocation[];
  explanation: string;
  uncertainty: string;
  review: ReviewState;
  saved: boolean;
}
export interface Citation {
  documentId: ID;
  location?: SourceLocation;
}
export interface Draft {
  id: ID;
  projectId: ID;
  title: string;
  authors: string;
  abstract: string;
  body: string;
  citations: Citation[];
  updatedAt: string;
  style: "APA 7";
}
export interface AssistantMessage {
  id: ID;
  role: "user" | "assistant";
  text: string;
  scope: "project" | "document" | "selection";
  location?: SourceLocation;
  citations?: SourceLocation[];
  createdAt: string;
}
export interface Conversation {
  id: ID;
  projectId: ID;
  messages: AssistantMessage[];
}
export interface UploadJob {
  id: ID;
  documentId: ID;
  state: ProcessingState;
  progress: number;
  error?: string;
}
export interface WorkspaceData {
  loadError?: string;
  projects: Project[];
  documents: Document[];
  annotations: Annotation[];
  notes: Note[];
  concepts: Concept[];
  claims: Claim[];
  findings: EvidenceFinding[];
  draft: Draft;
  drafts: Record<ID, Draft>;
  conversation: Conversation;
  conversations: Record<ID, Conversation>;
  uploads: UploadJob[];
  activeProjectId: ID;
}
