import type {
  Annotation,
  AssistantMessage,
  Concept,
  Document,
  Draft,
  EvidenceFinding,
  ID,
  Note,
  Project,
  SourceLocation,
  WorkspaceData,
  TrashItem,
} from "./models";

export interface ResearchService {
  refresh(): Promise<void>;
  manageTestData?: (load: boolean) => void;
  snapshot(): WorkspaceData;
  subscribe(listener: () => void): () => void;
  setActiveProject(id: ID): Promise<void>;
  createProject(name: string, prompt?: string, activate?: boolean): Promise<Project>;
  /** Generate the name and roadmap together, then persist the completed project. */
  createPlannedProject(prompt: string): Promise<Project>;
  /** Plans a roadmap for a project from a research prompt (a Roadmap note with concepts and papers). */
  planProject?(projectId: ID, prompt: string): Promise<void>;
  addLink(url: string, title: string): Promise<Document>;
  upload(file: File): Promise<Document>;
  retryUpload(id: ID): Promise<void>;
  updateDocument(id: ID, patch: Partial<Pick<Document, "reading" | "tags">>): Promise<void>;
  annotate(annotation: Omit<Annotation, "id" | "createdAt">): Promise<Annotation>;
  saveNote(note: Omit<Note, "id" | "updatedAt"> & { id?: ID }): Promise<Note>;
  deleteNote(id: ID): Promise<void>;
  trashItem(id: ID, kind: TrashItem["kind"]): Promise<ID>;
  restoreItem(id: ID): Promise<void>;
  setConceptStatus(id: ID, status: Concept["status"]): Promise<void>;
  saveConcept(concept: Omit<Concept, "id">): Promise<Concept>;
  setFindingSaved(id: ID, saved: boolean): Promise<void>;
  saveDraft(patch: Partial<Draft>): Promise<void>;
  ask(
    question: string,
    scope: AssistantMessage["scope"],
    location?: SourceLocation,
  ): Promise<AssistantMessage>;
  search(
    query: string,
    projectId: ID,
  ): Promise<{ document: Document; location: SourceLocation; excerpt: string }[]>;
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
export const stamp = () => new Date().toISOString();
export const citationText = (document: Document) => {
  const author = document.authors.length ? document.authors.join(", ") : "[Author missing]";
  return `${author} (${document.year ?? "n.d."}). ${document.title}. ${document.venue ?? "[Publication missing]"}.`;
};
export const inlineCitation = (document: Document) =>
  `(${document.authors[0]?.split(" ").at(-1) ?? "Author missing"}, ${document.year ?? "n.d."})`;
export const locationLabel = (document: Document | undefined, location?: SourceLocation) =>
  `${document?.title ?? "Unknown source"}${location?.page ? ` · p. ${location.page}` : ""}`;
export const findingLabel = (type: EvidenceFinding["type"]) =>
  ({
    supporting: "Supporting evidence",
    "potential-contradiction": "Potential contradiction",
    "different-conditions": "Different conditions",
    insufficient: "Insufficient evidence",
  })[type];
