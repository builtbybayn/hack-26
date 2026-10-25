"use client";

/**
 * The workspace's data, from the real app: the vault (projects are top-level folders, with their
 * papers and notes inside), parsed papers and their analysis, highlights, and mastery, all in
 * this browser's IndexedDB; plus the server APIs (parsing, analysis, chat). Implements the UI's
 * `ResearchService` contract, replacing the fictional demo adapter.
 */
import { saveAnnotation, subscribeAnnotations } from "@/features/paper-reader/annotations-store";
import { loadLocal } from "@/features/vault/use-settings";
import {
  CHATS_FOLDER,
  ensureFolder,
  newId,
  newProjectEntries,
  PAPERS_FOLDER,
  paperName,
  placeUnfiledPapers,
  uniqueName,
} from "@/features/vault/vault-tree";
import { requestChatReply } from "@/lib/api/chat-client";
import { requestRoadmap } from "@/lib/api/roadmap-client";
import { roadmapToMarkdown } from "@/lib/research/roadmap-markdown";
import { parseDocument } from "@/lib/api/intelligence-client";
import {
  deleteVaultEntries,
  restoreVaultEntry,
  trashVaultEntry,
  getWorkspaceState,
  listAllAnnotations,
  listDocumentRecords,
  listVaultEntries,
  loadMastery,
  putVaultEntries,
  updateWorkspaceState,
  saveDocument,
  saveMastery,
  savePaperFile,
  subscribeStoreChanges,
  type DocumentRecord,
} from "@/lib/browser-store";
import { runPaperPipeline } from "@/lib/paper-pipeline";
import type { ChatPaperContext, ChatTurn } from "@/types/chat";
import { MAX_FILE_BYTES } from "@/types/ingestion";
import type { MasteryLevel } from "@/types/intelligence";
import type {
  Annotation as VaultAnnotation,
  VaultEntry,
  VaultFolder,
  VaultNote,
  VaultPaper,
} from "@/types/vault";
import type {
  Annotation,
  AssistantMessage,
  Claim,
  Concept,
  Conversation,
  Document,
  Draft,
  EvidenceFinding,
  ID,
  Note,
  Project,
  SourceLocation,
  UploadJob,
  WorkspaceData,
  TrashItem,
} from "./models";
import type { ResearchService } from "./service";
import { stamp } from "./service";
import { DEMO_PREFIX, loadDemo } from "./dev-seed";

/** Workspace state that isn't part of the vault itself. Saved as one IndexedDB record. */
interface StoredState {
  activeProjectId?: ID;
  demoEvidence?: { claims: Claim[]; findings: EvidenceFinding[] };
  documents: Record<ID, { reading?: Document["reading"]; tags?: string[] }>;
  drafts: Record<ID, Draft>;
  conversations: Record<ID, Conversation>;
  /** Earlier chats per project, newest first. */
  chatHistory?: Record<ID, Conversation[]>;
  /** Prerequisites added from the assistant (analysis concepts come from the papers). */
  concepts: Concept[];
  savedFindings: ID[];
  links: Document[];
  sourceTrash?: Record<ID, { document: Document; trashedAt: string }>;
}

const EMPTY_STATE: StoredState = {
  documents: {},
  drafts: {},
  conversations: {},
  concepts: [],
  savedFindings: [],
  links: [],
};

const DEFAULT_PROJECT = "My research";
const NOTES_FOLDER = "Notes";
/** /api/chat reads at most this many papers per question. */
const MAX_CHAT_PAPERS = 5;
const ACCEPTED = /\.(pdf|txt|md|markdown)$/i;

const LOADING_PROJECT: Project = {
  id: "loading",
  name: "Opening your vault…",
  description: "",
  updatedAt: "",
};

export const EMPTY_WORKSPACE: WorkspaceData = {
  projects: [LOADING_PROJECT],
  documents: [],
  annotations: [],
  notes: [],
  concepts: [],
  claims: [],
  findings: [],
  draft: emptyDraft("loading"),
  drafts: {},
  conversation: { id: "loading", projectId: "loading", messages: [] },
  conversations: {},
  chatHistory: {},
  uploads: [],
  activeProjectId: "loading",
};

function emptyDraft(projectId: ID): Draft {
  return {
    id: `draft-${projectId}`,
    projectId,
    title: "",
    authors: "",
    abstract: "",
    body: "",
    citations: [],
    updatedAt: stamp(),
    style: "APA 7",
  };
}

/** An upload being parsed: shown in the library before the paper exists in the vault. */
interface PendingUpload {
  document: Document;
  file: File;
  projectId: ID;
}

export class VaultResearchService implements ResearchService {
  private data: WorkspaceData = EMPTY_WORKSPACE;
  private listeners = new Set<() => void>();
  private state: StoredState = EMPTY_STATE;
  private entries: VaultEntry[] = [];
  private records = new Map<ID, DocumentRecord>();
  private pending = new Map<ID, PendingUpload>();
  private analyzing = new Set<ID>();
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private loading: Promise<void> | null = null;
  private reloadRequested = false;
  private mutations: Promise<void> = Promise.resolve();

  constructor() {
    if (typeof window === "undefined") return;
    void this.refresh().catch(() => {});
    // The extension (or another tab) saved a paper, a note, or a highlight.
    subscribeStoreChanges(() => this.scheduleRefresh());
    subscribeAnnotations(() => this.scheduleRefresh());
  }

  snapshot = () => this.data;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit() {
    this.listeners.forEach((listener) => listener());
  }

  private scheduleRefresh() {
    clearTimeout(this.refreshTimer);
    this.refreshTimer = setTimeout(() => void this.refresh().catch(() => {}), 150);
  }

  /** Reads everything from IndexedDB and rebuilds the UI's snapshot. */
  refresh(): Promise<void> {
    if (this.loading) {
      this.reloadRequested = true;
      return this.loading;
    }
    this.loading = (async () => {
      do {
        this.reloadRequested = false;
        await this.load();
      } while (this.reloadRequested);
    })()
      .catch((error) => {
        this.data = {
          ...this.data,
          loadError:
            error instanceof Error ? error.message : "Browser storage could not be opened.",
        };
        this.emit();
        throw error;
      })
      .finally(() => {
        this.loading = null;
      });
    return this.loading;
  }

  private async load() {
    const [entries, records, annotations, mastery, stored] = await Promise.all([
      listVaultEntries(true),
      listDocumentRecords(),
      listAllAnnotations(),
      loadMastery(),
      getWorkspaceState<StoredState>(),
    ]);
    this.state = { ...EMPTY_STATE, ...stored };
    let all = entries.filter((entry) => !entry.trashedAt);

    // Every vault needs a project, and every saved paper belongs in one.
    const added: VaultEntry[] = [];
    if (!projectFolders(all).length) added.push(...newProjectFolders(all, DEFAULT_PROJECT).created);
    added.push(...placeUnfiledPapers([...all, ...added], records));
    if (added.length) {
      await putVaultEntries(added);
      all = [...all, ...added];
    }
    this.entries = all;
    this.records = new Map(records.map((record) => [record.id, record]));
    this.data = buildSnapshot(all, this.records, annotations, mastery, this.state, {
      pending: [...this.pending.values()],
      analyzing: this.analyzing,
    });
    if (this.state.demoEvidence) {
      const projects = new Set(this.data.projects.map((project) => project.id));
      this.data.claims.push(
        ...this.state.demoEvidence.claims.filter((item) => projects.has(item.projectId)),
      );
      this.data.findings.push(
        ...this.state.demoEvidence.findings.filter((item) => projects.has(item.projectId)),
      );
    }
    this.data.folders = all
      .filter((entry): entry is VaultFolder => entry.kind === "folder" && entry.parentId !== null)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        parentId: entry.parentId,
        projectId: projectOf(all, entry, this.data.activeProjectId),
      }));
    this.data.trash = [
      ...entries
        .filter((entry) => entry.trashedAt && (entry.trashRootId || entry.id) === entry.id)
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          trashedAt: entry.trashedAt!,
          kind: (entry.kind === "folder"
            ? entry.parentId === null
              ? "project"
              : "folder"
            : entry.kind === "paper"
              ? "source"
              : entry.kind) as TrashItem["kind"],
        })),
      ...Object.values(this.state.sourceTrash ?? {}).map(({ document, trashedAt }) => ({
        id: document.id,
        name: document.title,
        kind: "source" as const,
        trashedAt,
      })),
    ].sort((a, b) => b.trashedAt.localeCompare(a.trashedAt));
    this.emit();
  }

  private async saveState(update: (state: StoredState) => void) {
    const mutation = this.mutations.then(async () => {
      this.state = await updateWorkspaceState<StoredState>((stored) => {
        const next = structuredClone({ ...EMPTY_STATE, ...stored });
        update(next);
        return next;
      });
      await this.refresh();
    });
    this.mutations = mutation.catch(() => {});
    await mutation;
  }

  private get projectId() {
    return this.data.activeProjectId;
  }

  /** Stable, opt-in development records live in the same browser stores as research. */
  async manageTestData(load: boolean) {
    if (process.env.NODE_ENV !== "development") throw new Error("Test data is development-only.");
    await this.refresh();
    const isDemo = (id: string) => id.startsWith(DEMO_PREFIX);
    if (load) {
      const seeded = loadDemo({ ...structuredClone(EMPTY_WORKSPACE), projects: [] });
      const existing = new Set(this.entries.map((entry) => entry.id));
      const entries: VaultEntry[] = [];
      for (const project of seeded.projects) {
        entries.push({
          id: project.id,
          kind: "folder",
          name: project.name,
          parentId: null,
          createdAt: project.updatedAt,
          updatedAt: project.updatedAt,
        });
        for (const note of seeded.notes.filter((item) => item.projectId === project.id))
          entries.push({
            id: note.id,
            kind: "note",
            name: note.title,
            body: note.body,
            parentId: project.id,
            createdAt: note.updatedAt,
            updatedAt: note.updatedAt,
            meta: {
              location: note.location,
              conceptId: note.conceptId,
              findingId: note.findingId,
              question: note.question,
              resolved: note.resolved,
            },
          });
      }
      await putVaultEntries(entries.filter((entry) => !existing.has(entry.id)));
      await this.saveState((state) => {
        const merge = <T extends { id: string }>(old: T[], added: T[]) => {
          const ids = new Set(old.map((item) => item.id));
          return [...old, ...added.filter((item) => !ids.has(item.id))];
        };
        state.links = merge(state.links, seeded.documents);
        state.concepts = merge(state.concepts, seeded.concepts);
        state.demoEvidence = {
          claims: merge(state.demoEvidence?.claims || [], seeded.claims),
          findings: merge(state.demoEvidence?.findings || [], seeded.findings),
        };
      });
    } else {
      // Real notes created inside a demo folder must survive clearing its parent.
      const fallback = this.data.projects.find((project) => !isDemo(project.id))?.id;
      const realChildren = this.entries.filter(
        (entry) => !isDemo(entry.id) && entry.parentId && isDemo(entry.parentId),
      );
      if (realChildren.length) {
        if (!fallback)
          throw new Error(
            "Create a real project before clearing demo folders containing your notes.",
          );
        await putVaultEntries(realChildren.map((entry) => ({ ...entry, parentId: fallback })));
      }
      // Keep authored writing and chats accessible under recovered real projects.
      const recovered = new Map<string, string>();
      const recoveryEntries: VaultEntry[] = [];
      for (const project of this.data.projects.filter((item) => isDemo(item.id))) {
        const draft = this.state.drafts[project.id];
        const chat = this.state.conversations[project.id];
        if (
          !(draft && (draft.title || draft.abstract || draft.body || draft.citations.length)) &&
          !chat?.messages.length
        )
          continue;
        const id = newId();
        recovered.set(project.id, id);
        recoveryEntries.push({
          id,
          kind: "folder",
          name: `Recovered · ${project.name.replace(/^DEMO · /, "")}`,
          parentId: null,
          createdAt: stamp(),
          updatedAt: stamp(),
        });
      }
      if (recoveryEntries.length) await putVaultEntries(recoveryEntries);
      await deleteVaultEntries(
        this.entries.filter((entry) => isDemo(entry.id)).map((entry) => entry.id),
      );
      await this.saveState((state) => {
        state.links = state.links
          .filter((item) => !isDemo(item.id))
          .map((item) =>
            fallback && isDemo(item.projectId) ? { ...item, projectId: fallback } : item,
          );
        state.concepts = state.concepts
          .filter((item) => !isDemo(item.id))
          .map((item) =>
            fallback && isDemo(item.projectId) ? { ...item, projectId: fallback } : item,
          );
        delete state.demoEvidence;
        if (state.activeProjectId && isDemo(state.activeProjectId))
          state.activeProjectId = fallback;
        for (const id of Object.keys(state.drafts).filter(isDemo)) {
          const target = recovered.get(id);
          if (target) state.drafts[target] = { ...state.drafts[id], projectId: target };
          delete state.drafts[id];
        }
        for (const id of Object.keys(state.conversations).filter(isDemo)) {
          const target = recovered.get(id);
          if (target)
            state.conversations[target] = { ...state.conversations[id], projectId: target };
          delete state.conversations[id];
        }
      });
    }
  }

  async setActiveProject(id: ID) {
    if (!this.data.projects.some((project) => project.id === id))
      throw new Error("Project not found.");
    await this.saveState((state) => {
      state.activeProjectId = id;
    });
  }

  async createProject(name: string, prompt?: string, activate = true): Promise<Project> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Enter a project name.");
    const previousProjectId = this.projectId;
    const { project, created } = newProjectFolders(this.entries, trimmed);
    await putVaultEntries(created);
    await this.saveState((state) => {
      if (activate) state.activeProjectId = project.id;
      else state.activeProjectId ??= previousProjectId;
    });
    return {
      id: project.id,
      name: project.name,
      description: prompt?.trim() ?? "",
      updatedAt: project.updatedAt,
    };
  }

  async createPlannedProject(prompt: string): Promise<Project> {
    const idea = prompt.trim();
    if (!idea) throw new Error("Describe your research first.");
    const result = await requestRoadmap({ idea });
    if (!result.ok) throw new Error(result.error.message);
    const { roadmap } = result.data;
    const name = roadmap.projectName?.trim();
    if (!name) throw new Error("The roadmap did not include a project name. Please try again.");
    await this.refresh();
    const previousProjectId = this.projectId;
    const { project, created } = newProjectEntries(this.entries, name, roadmapToMarkdown(roadmap));
    // The generated name and its roadmap become visible together in one vault transaction.
    await putVaultEntries(created);
    await this.saveState((state) => {
      state.activeProjectId ??= previousProjectId;
    });
    return this.data.projects.find((item) => item.id === project.id)!;
  }

  /**
   * Plans the project with /api/roadmap: a Roadmap note in its Notes folder (stages, concepts,
   * and real papers), and the project takes the roadmap's short name.
   */
  async planProject(projectId: ID, prompt: string) {
    const result = await requestRoadmap({ idea: prompt });
    if (!result.ok) throw new Error(result.error.message);
    const { roadmap } = result.data;
    const project = this.entries.find((entry) => entry.id === projectId);
    if (!project || project.kind !== "folder") throw new Error("Project not found.");
    const notes = ensureFolder(this.entries, projectId, NOTES_FOLDER);
    const at = stamp();
    const others = this.entries.filter((entry) => entry.id !== projectId);
    await putVaultEntries([
      ...notes.created,
      {
        ...project,
        name: uniqueName(others, null, roadmap.projectName || project.name),
        updatedAt: at,
      },
      {
        id: newId(),
        kind: "note",
        name: uniqueName(this.entries, notes.folderId, "Roadmap"),
        parentId: notes.folderId,
        body: roadmapToMarkdown(roadmap),
        createdAt: at,
        updatedAt: at,
      } satisfies VaultNote,
    ]);
    await this.refresh();
  }

  async addLink(url: string, title: string): Promise<Document> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("Enter a valid URL.");
    }
    if (!["https:", "http:"].includes(parsed.protocol))
      throw new Error("Use an http or https URL.");
    const link: Document = {
      id: `link-${newId()}`,
      projectId: this.projectId,
      title: title.trim() || parsed.hostname,
      kind: "link",
      authors: [],
      tags: [],
      status: "ready",
      reading: "unread",
      addedAt: stamp(),
      summary:
        "Saved link. To read and annotate it here, add its PDF (or save it from the Fluid Research extension).",
      url: parsed.toString(),
      passages: [],
    };
    await this.saveState((state) => {
      state.links.unshift(link);
    });
    return link;
  }

  /** Parses the file on the server, files it in the project's Papers folder, then analyzes it. */
  async upload(file: File): Promise<Document> {
    if (!file.name) throw new Error("Choose a file.");
    if (!ACCEPTED.test(file.name)) throw new Error("Choose a PDF, TXT, or Markdown file.");
    if (file.size > MAX_FILE_BYTES)
      throw new Error(`Files up to ${MAX_FILE_BYTES / 1024 / 1024} MB can be added.`);
    const temporary: Document = {
      id: `upload-${newId()}`,
      projectId: this.projectId,
      title: file.name,
      kind: /\.pdf$/i.test(file.name) ? "pdf" : "article",
      authors: [],
      tags: [],
      status: "uploading",
      reading: "unread",
      addedAt: stamp(),
      summary: "Reading the file…",
      passages: [],
      progress: 30,
    };
    this.pending.set(temporary.id, { document: temporary, file, projectId: this.projectId });
    await this.refresh();
    return this.ingest(temporary.id);
  }

  private async ingest(pendingId: ID): Promise<Document> {
    const upload = this.pending.get(pendingId)!;
    const parsed = await parseDocument(upload.file, { mode: "automatic" });
    if (!parsed.ok) {
      upload.document = {
        ...upload.document,
        status: "failed",
        error: parsed.error.message,
        summary: "This file couldn't be read.",
      };
      await this.refresh();
      return upload.document;
    }
    const { document } = parsed.data;
    const placed = this.entries.find(
      (entry): entry is VaultPaper => entry.kind === "paper" && entry.documentId === document.id,
    );
    if (!placed) {
      const papers = ensureFolder(this.entries, upload.projectId, PAPERS_FOLDER);
      const at = stamp();
      await putVaultEntries([
        ...papers.created,
        {
          id: `paper-${document.id}`,
          kind: "paper",
          name: uniqueName(this.entries, papers.folderId, paperName({ document })),
          parentId: papers.folderId,
          documentId: document.id,
          createdAt: at,
          updatedAt: at,
        },
      ]);
    }
    await savePaperFile(document.id, upload.file, upload.file.name);
    await saveDocument(document);
    this.pending.delete(pendingId);
    await this.refresh();
    void this.analyze(document.id);
    return this.data.documents.find((item) => item.id === document.id) ?? upload.document;
  }

  /** Concepts, related papers, and the contradiction check, in the background. */
  private async analyze(documentId: ID) {
    const record = this.records.get(documentId);
    if (!record || this.analyzing.has(documentId)) return;
    this.analyzing.add(documentId);
    this.scheduleRefresh();
    try {
      await runPaperPipeline(record.document, { onUpdate: () => this.scheduleRefresh() });
    } catch {
      // Failures are recorded on the paper's pipeline steps and shown in its summary.
    } finally {
      this.analyzing.delete(documentId);
      this.scheduleRefresh();
    }
  }

  async retryUpload(id: ID) {
    if (this.pending.has(id)) {
      const upload = this.pending.get(id)!;
      upload.document = { ...upload.document, status: "uploading", error: undefined };
      await this.refresh();
      await this.ingest(id);
      return;
    }
    if (!this.records.has(id)) throw new Error("Upload not found.");
    await this.analyze(id);
  }

  async updateDocument(id: ID, patch: Partial<Pick<Document, "reading" | "tags">>) {
    await this.saveState((state) => {
      const link = state.links.find((item) => item.id === id);
      if (link) Object.assign(link, patch);
      else state.documents[id] = { ...state.documents[id], ...patch };
    });
  }

  /** Page or passage annotations from the UI become reader annotations (shown in the margin). */
  async annotate(input: Omit<Annotation, "id" | "createdAt">): Promise<Annotation> {
    const at = stamp();
    const annotation: VaultAnnotation = {
      id: newId(),
      documentId: input.location.documentId,
      pageNumber: input.location.page ?? 1,
      rects: [],
      quote: input.location.quote ?? "",
      color: "yellow",
      comment: input.kind === "highlight" ? null : input.text,
      author: loadLocal<{ authorName?: string }>("vaultSettings", {}).authorName || "You",
      createdAt: at,
      updatedAt: at,
    };
    await saveAnnotation(annotation);
    await this.refresh();
    return { ...input, id: annotation.id, createdAt: at };
  }

  async saveNote(input: Omit<Note, "id" | "updatedAt"> & { id?: ID }): Promise<Note> {
    if (!input.title.trim() && !input.body.trim()) throw new Error("Write a title or note.");
    if (input.id) await this.refresh();
    const meta: VaultNote["meta"] = {
      question: input.question,
      resolved: input.resolved,
      location: input.location,
      conceptId: input.conceptId,
      findingId: input.findingId,
    };
    const existing = this.entries.find(
      (entry): entry is VaultNote => entry.kind === "note" && entry.id === input.id,
    );
    const at = stamp();
    if (input.id && !existing)
      throw new Error("This note is no longer available. Restore it from Trash before editing.");
    let note: VaultNote;
    if (existing) {
      note = {
        ...existing,
        name: input.title.trim() || existing.name,
        body: input.body,
        meta,
        updatedAt: at,
      };
      await putVaultEntries([note]);
    } else {
      const notes = ensureFolder(this.entries, input.projectId || this.projectId, NOTES_FOLDER);
      note = {
        id: newId(),
        kind: "note",
        name: uniqueName(this.entries, notes.folderId, input.title.trim() || "Untitled"),
        parentId: notes.folderId,
        body: input.body,
        meta,
        createdAt: at,
        updatedAt: at,
      };
      await putVaultEntries([...notes.created, note]);
    }
    await this.refresh();
    return toNote(note, input.projectId || this.projectId);
  }

  async deleteNote(id: ID) {
    await this.trashItem(id, "note");
  }

  async trashItem(id: ID, kind: TrashItem["kind"]) {
    await this.refresh();
    const entry =
      kind === "source"
        ? this.entries.find(
            (item) =>
              item.kind === "paper" &&
              item.documentId === id &&
              projectOf(this.entries, item, "") === this.projectId,
          )
        : this.entries.find((item) => item.id === id);
    if (entry) {
      await trashVaultEntry(entry.id);
      await this.refresh();
      return entry.id;
    }
    if (kind !== "source") throw new Error("This item is no longer available.");
    if (this.pending.has(id))
      throw new Error("Wait for this upload to finish before moving it to Trash.");
    const document = this.data.documents.find((item) => item.id === id);
    if (!document) throw new Error("This source is no longer available.");
    await this.saveState((state) => {
      state.sourceTrash ??= {};
      state.sourceTrash[id] = { document, trashedAt: stamp() };
    });
    return id;
  }

  async restoreItem(id: ID) {
    if (this.state.sourceTrash?.[id]) {
      if (
        !this.data.projects.some(
          (project) => project.id === this.state.sourceTrash?.[id].document.projectId,
        )
      )
        throw new Error("Restore the containing project from Trash first.");
      await this.saveState((state) => {
        delete state.sourceTrash?.[id];
      });
    } else {
      await restoreVaultEntry(id);
      await this.refresh();
    }
  }

  async setConceptStatus(id: ID, status: Concept["status"]) {
    const [, conceptId] = id.split("::");
    if (conceptId) {
      await saveMastery(conceptId, toMastery(status));
      await this.refresh();
      return;
    }
    await this.saveState((state) => {
      const concept = state.concepts.find((item) => item.id === id);
      if (concept) concept.status = status;
    });
  }

  async saveConcept(input: Omit<Concept, "id">): Promise<Concept> {
    const concept: Concept = { ...input, id: `concept-${newId()}` };
    await this.saveState((state) => {
      state.concepts.push(concept);
    });
    return concept;
  }

  async setFindingSaved(id: ID, saved: boolean) {
    await this.saveState((state) => {
      state.savedFindings = saved
        ? [...new Set([...state.savedFindings, id])]
        : state.savedFindings.filter((item) => item !== id);
    });
  }

  async saveDraft(patch: Partial<Draft>) {
    const projectId = patch.projectId || this.projectId;
    await this.saveState((state) => {
      const current = state.drafts[projectId] ?? emptyDraft(projectId);
      state.drafts[projectId] = { ...current, ...patch, projectId, updatedAt: stamp() };
    });
  }

  async newChat() {
    const projectId = this.projectId;
    await this.saveState((state) => {
      archiveCurrentChat(state, projectId);
      state.conversations[projectId] = { id: newId(), projectId, messages: [] };
    });
  }

  async openChat(id: ID) {
    const projectId = this.projectId;
    await this.saveState((state) => {
      const history = state.chatHistory?.[projectId] ?? [];
      const chat = history.find((item) => item.id === id);
      if (!chat) return;
      state.chatHistory![projectId] = history.filter((item) => item.id !== id);
      archiveCurrentChat(state, projectId);
      state.conversations[projectId] = chat;
    });
  }

  /** Answers with /api/chat, grounded in the project's papers, the open paper, or a passage. */
  async ask(
    question: string,
    scope: AssistantMessage["scope"],
    location?: SourceLocation,
  ): Promise<AssistantMessage> {
    if (!question.trim()) throw new Error("Write a question first.");
    if (scope !== "project" && (!location?.documentId || !this.records.has(location.documentId))) {
      throw new Error("Open a saved paper before asking about a document or selection.");
    }
    if (scope === "selection" && !location?.quote?.trim()) {
      throw new Error("Select a passage in the reader first.");
    }
    const projectId = this.projectId;
    const user: AssistantMessage = {
      id: newId(),
      role: "user",
      text: question,
      scope,
      location,
      createdAt: stamp(),
    };
    await this.saveState((state) => {
      conversationOf(state, projectId).messages.push(user);
    });

    const projectPapers = this.data.documents.filter(
      (doc) => doc.projectId === projectId && this.records.has(doc.id),
    );
    const focused =
      scope !== "project" && location?.documentId && this.records.has(location.documentId)
        ? [location.documentId]
        : [];
    const paperIds = (focused.length ? focused : projectPapers.map((doc) => doc.id)).slice(
      0,
      MAX_CHAT_PAPERS,
    );
    const papers: ChatPaperContext[] = paperIds.flatMap((id) => {
      const record = this.records.get(id);
      return record
        ? [
            {
              title: paperName(record),
              subject: record.analysis?.understanding.subject,
              topics: record.analysis?.understanding.topics,
              pages: record.document.pages.map(({ pageNumber, text }) => ({ pageNumber, text })),
            },
          ]
        : [];
    });
    const history = conversationOf(this.state, projectId).messages.slice(-16);
    const turns: ChatTurn[] = history.map((message) => {
      const record = message.location ? this.records.get(message.location.documentId) : undefined;
      return {
        role: message.role,
        content: message.text,
        ...(message.scope === "selection" && message.location?.quote && record
          ? {
              passage: {
                title: paperName(record),
                pageNumber: message.location.page ?? 1,
                text: message.location.quote,
              },
            }
          : {}),
      };
    });

    const result = await requestChatReply({ messages: turns, papers });
    if (!result.ok) throw new Error(result.error.message);
    const reply = result.data.reply;
    // Page references in a single-paper answer link back to that paper.
    const citations: SourceLocation[] =
      paperIds.length === 1
        ? [...new Set([...reply.matchAll(/\bp+\.\s*(\d+)/g)].map((match) => Number(match[1])))]
            .slice(0, 4)
            .map((page) => ({ documentId: paperIds[0], page }))
        : [];
    const assistant: AssistantMessage = {
      id: newId(),
      role: "assistant",
      text: reply,
      scope,
      location,
      citations,
      createdAt: stamp(),
    };
    await this.saveState((state) => {
      conversationOf(state, projectId).messages.push(assistant);
    });
    return assistant;
  }

  async search(query: string, projectId: ID) {
    const needle = query.toLowerCase();
    return this.data.documents
      .filter((doc) => doc.projectId === projectId)
      .flatMap((document) =>
        document.passages
          .filter((passage) => passage.text.toLowerCase().includes(needle))
          .map((passage) => ({
            document,
            location: {
              documentId: document.id,
              passageId: passage.id,
              page: passage.page,
              quote: passage.text,
            },
            excerpt: passage.text,
          })),
      );
  }
}

function archiveCurrentChat(state: StoredState, projectId: ID) {
  const current = state.conversations[projectId];
  if (!current?.messages.length) return;
  state.chatHistory ??= {};
  state.chatHistory[projectId] = [current, ...(state.chatHistory[projectId] ?? [])].slice(0, 50);
}

function conversationOf(state: StoredState, projectId: ID): Conversation {
  state.conversations[projectId] ??= { id: `conversation-${projectId}`, projectId, messages: [] };
  return state.conversations[projectId];
}

// ---- Vault structure -------------------------------------------------------------------------

/** Projects are the top-level folders, other than the shared "Chats" and a loose "Papers". */
export function projectFolders(entries: VaultEntry[]): VaultFolder[] {
  return entries
    .filter(
      (entry): entry is VaultFolder =>
        entry.kind === "folder" &&
        entry.parentId === null &&
        entry.name !== CHATS_FOLDER &&
        entry.name !== PAPERS_FOLDER,
    )
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }),
    );
}

export function newProjectFolders(entries: VaultEntry[], name: string) {
  const at = stamp();
  const folder = (folderName: string, parentId: string | null): VaultFolder => ({
    id: newId(),
    kind: "folder",
    name: folderName,
    parentId,
    createdAt: at,
    updatedAt: at,
  });
  const project = folder(uniqueName(entries, null, name), null);
  return {
    project,
    created: [project, folder(NOTES_FOLDER, project.id), folder(PAPERS_FOLDER, project.id)],
  };
}

/** The project an entry belongs to: its top-level folder, else the first project. */
export function projectOf(entries: VaultEntry[], entry: VaultEntry, fallback: ID): ID {
  const byId = new Map(entries.map((item) => [item.id, item]));
  let current: VaultEntry | undefined = entry;
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  const projects = new Set(projectFolders(entries).map((project) => project.id));
  return current && projects.has(current.id) ? current.id : fallback;
}

// ---- Snapshot --------------------------------------------------------------------------------

export function buildSnapshot(
  entries: VaultEntry[],
  records: Map<ID, DocumentRecord>,
  annotations: VaultAnnotation[],
  mastery: Record<string, MasteryLevel>,
  state: StoredState,
  live: { pending: PendingUpload[]; analyzing: Set<ID> },
): WorkspaceData {
  const folders = projectFolders(entries);
  const fallback = folders[0]?.id ?? "loading";
  const projects: Project[] = folders.map((folder) => ({
    id: folder.id,
    name: folder.name,
    description: projectGoal(entries, folder.id),
    updatedAt: folder.updatedAt,
  }));
  const activeProjectId = projects.some((project) => project.id === state.activeProjectId)
    ? state.activeProjectId!
    : fallback;

  const documents: Document[] = [];
  for (const entry of entries) {
    if (entry.kind !== "paper") continue;
    const record = records.get(entry.documentId);
    if (!record) continue;
    documents.push(
      toDocument(record, entry, projectOf(entries, entry, fallback), state, live.analyzing),
    );
  }
  const documentProject = new Map(documents.map((doc) => [doc.id, doc.projectId]));

  const literature: Document[] = [];
  const concepts: Concept[] = [];
  const claims: Claim[] = [];
  const findings: EvidenceFinding[] = [];
  let order = 0;
  for (const document of documents) {
    const record = records.get(document.id)!;
    const analysis = record.analysis;
    if (analysis) {
      for (const item of analysis.learningPath) {
        const concept = analysis.graph.concepts.find((entry) => entry.id === item.conceptId);
        if (!concept) continue;
        const id = `${document.id}::${concept.id}`;
        const reference = concept.sourceReferences[0];
        concepts.push({
          id,
          projectId: document.projectId,
          name: concept.name,
          why: concept.description,
          refresher: item.reason,
          requires: analysis.graph.dependencies
            .filter((dependency) => dependency.dependentId === concept.id)
            .map((dependency) => `${document.id}::${dependency.prerequisiteId}`),
          location: {
            documentId: document.id,
            page: reference?.pageNumber,
            quote: reference?.quote,
          },
          status: fromMastery(mastery[concept.id]),
          origin: concept.sourceReferences.some((ref) => ref.quote) ? "confirmed" : "inferred",
          order: ++order,
        });
      }
    }

    const report = record.contradictions;
    for (const source of report?.sources ?? []) {
      if (source.kind !== "literature" || literature.some((doc) => doc.id === source.documentId))
        continue;
      literature.push({
        id: source.documentId,
        projectId: document.projectId,
        title: source.title,
        kind: "link",
        authors: [],
        tags: ["published"],
        status: "ready",
        reading: "unread",
        addedAt: record.updatedAt,
        summary: "A published paper compared with your sources (by its abstract).",
        url: source.url,
        passages: [],
      });
    }
    for (const finding of report?.findings ?? []) {
      const id = `${document.id}:${finding.id}`;
      const [first, second] = finding.claims;
      const at = (claim: typeof first): SourceLocation => ({
        documentId: claim.documentId,
        page: claim.source.pageNumber,
        quote: claim.source.quote,
      });
      claims.push({
        id: `claim-${id}`,
        projectId: document.projectId,
        text: first.text,
        location: at(first),
        assumptions: [
          { id: `${id}-a`, text: first.conditions, location: at(first) },
          { id: `${id}-b`, text: second.conditions, location: at(second) },
        ],
      });
      findings.push({
        id,
        projectId: document.projectId,
        claimId: `claim-${id}`,
        type:
          finding.review.grok === "compatible"
            ? "different-conditions"
            : finding.review.grok === "unclear"
              ? "insufficient"
              : "potential-contradiction",
        related: [at(first), at(second)],
        explanation: finding.explanation,
        uncertainty:
          finding.alternativeExplanations.join(" ") ||
          "Check whether the populations, methods, and measures are comparable.",
        review: finding.review.grok === "contradiction" ? "confirmed" : "needs-review",
        saved: state.savedFindings.includes(id),
      });
    }
  }
  concepts.push(...state.concepts);

  const notes: Note[] = entries
    .filter((entry): entry is VaultNote => entry.kind === "note")
    .map((note) => toNote(note, projectOf(entries, note, fallback)));

  const uiAnnotations: Annotation[] = annotations.flatMap((annotation) => {
    const projectId = documentProject.get(annotation.documentId);
    if (!projectId) return [];
    return [
      {
        id: annotation.id,
        projectId,
        location: {
          documentId: annotation.documentId,
          page: annotation.pageNumber,
          quote: annotation.quote || undefined,
        },
        kind: annotation.comment ? "note" : "highlight",
        text: annotation.comment || annotation.quote,
        createdAt: annotation.createdAt,
      },
    ];
  });

  const uploads: UploadJob[] = live.pending.map(({ document }) => ({
    id: document.id,
    documentId: document.id,
    state: document.status,
    progress: document.progress ?? 0,
    error: document.error,
  }));

  const drafts = Object.fromEntries(
    projects.map((project) => [project.id, state.drafts[project.id] ?? emptyDraft(project.id)]),
  );
  const conversations = Object.fromEntries(
    projects.map((project) => [
      project.id,
      state.conversations[project.id] ?? {
        id: `conversation-${project.id}`,
        projectId: project.id,
        messages: [],
      },
    ]),
  );

  return {
    projects: projects.length ? projects : [LOADING_PROJECT],
    documents: [
      ...live.pending.map(({ document, projectId }) => ({ ...document, projectId })),
      ...documents.sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
      ...state.links.filter((link) => projects.some((project) => project.id === link.projectId)),
      ...literature,
    ].filter((document) => !state.sourceTrash?.[document.id]),
    annotations: uiAnnotations,
    notes: notes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    concepts,
    claims,
    findings,
    draft: drafts[activeProjectId] ?? emptyDraft(activeProjectId),
    drafts,
    conversation: conversations[activeProjectId] ?? EMPTY_WORKSPACE.conversation,
    conversations,
    chatHistory: state.chatHistory ?? {},
    uploads,
    activeProjectId,
  };
}

function toDocument(
  record: DocumentRecord,
  entry: VaultPaper,
  projectId: ID,
  state: StoredState,
  analyzing: Set<ID>,
): Document {
  const { document, analysis, pipeline } = record;
  const saved = state.documents[record.id];
  const author = document.metadata.author;
  const year = Number(String(document.metadata.createdAt ?? "").slice(0, 4));
  const failed = pipeline?.analysis.status === "failed" ? pipeline.analysis.message : null;
  return {
    id: record.id,
    projectId,
    title: paperName(record),
    kind: document.sourceType === "pdf" ? "pdf" : "article",
    authors: typeof author === "string" ? author.split(/\s*[;,]\s*|\s+and\s+/).filter(Boolean) : [],
    year: year > 1900 ? year : undefined,
    tags: saved?.tags ?? analysis?.understanding.topics.slice(0, 4) ?? [],
    status: "ready",
    reading: saved?.reading ?? "unread",
    error: !analyzing.has(record.id) && failed ? failed : undefined,
    addedAt: entry.createdAt,
    summary: analysis
      ? [analysis.understanding.subject, analysis.understanding.learningObjectives[0]]
          .filter(Boolean)
          .join(". ")
      : analyzing.has(record.id)
        ? "Analyzing: concepts and prerequisites, related papers, and contradictions…"
        : failed
          ? `Analysis failed: ${failed}`
          : `${document.pages.length} pages · ${document.stats.words.toLocaleString()} words`,
    passages: document.pages.map((page) => ({
      id: `p${page.pageNumber}`,
      heading: `Page ${page.pageNumber}`,
      text: page.text,
      page: page.pageNumber,
    })),
  };
}

function toNote(note: VaultNote, projectId: ID): Note {
  return {
    id: note.id,
    projectId,
    title: note.name,
    body: note.body,
    location: note.meta?.location,
    conceptId: note.meta?.conceptId,
    findingId: note.meta?.findingId,
    question: note.meta?.question ?? false,
    resolved: note.meta?.resolved ?? false,
    updatedAt: note.updatedAt,
  };
}

/** A project's goal: the quoted first line of its Roadmap note, when it has one. */
function projectGoal(entries: VaultEntry[], projectId: ID): string {
  const roadmap = entries.find(
    (entry): entry is VaultNote =>
      entry.kind === "note" &&
      (entry.name === "Roadmap" ||
        (entry.id.startsWith(DEMO_PREFIX) && entry.name === "DEMO · Roadmap")) &&
      projectOf(entries, entry, "") === projectId,
  );
  const goal = roadmap?.body.split("\n").find((line) => line.startsWith("> "));
  return goal ? goal.slice(2).trim() : "";
}

function fromMastery(level: MasteryLevel | undefined): Concept["status"] {
  return level === "mastered" ? "understood" : level === "learning" ? "learning" : "to-learn";
}

function toMastery(status: Concept["status"]): MasteryLevel {
  return status === "understood" ? "mastered" : status === "learning" ? "learning" : "unknown";
}
