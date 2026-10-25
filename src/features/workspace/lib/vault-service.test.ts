import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentRecord } from "@/lib/browser-store";
import type { VaultEntry } from "@/types/vault";
import { MOCK_INGEST_SUCCESS } from "@/lib/api/ingest-mock";
import { MOCK_ROADMAP_RESPONSE } from "@/lib/api/roadmap-mock";
import type { RoadmapResponse } from "@/types/roadmap";
import {
  entriesToRestore,
  entriesToTrash,
  validateVaultWrite,
  visibleDocumentRecords,
} from "@/lib/vault-trash";

const memory = vi.hoisted(() => ({
  entries: [] as VaultEntry[],
  records: [] as DocumentRecord[],
  workspace: null as unknown,
}));
vi.mock("@/lib/browser-store", () => ({
  listVaultEntries: vi.fn(async (includeTrashed = false) =>
    structuredClone(
      includeTrashed ? memory.entries : memory.entries.filter((entry) => !entry.trashedAt),
    ),
  ),
  listDocumentRecords: vi.fn(async () =>
    structuredClone(visibleDocumentRecords(memory.records, memory.entries)),
  ),
  listAllAnnotations: vi.fn(async () => []),
  loadMastery: vi.fn(async () => ({})),
  getWorkspaceState: vi.fn(async () => structuredClone(memory.workspace)),
  updateWorkspaceState: vi.fn(async (update) => {
    memory.workspace = update(structuredClone(memory.workspace));
    return structuredClone(memory.workspace);
  }),
  putVaultEntries: vi.fn(async (entries: VaultEntry[]) => {
    validateVaultWrite(memory.entries, entries);
    for (const entry of entries)
      memory.entries = [...memory.entries.filter((item) => item.id !== entry.id), entry];
  }),
  trashVaultEntry: vi.fn(async (id: string) => {
    const changes = entriesToTrash(memory.entries, id, "2026-10-25T12:00:00Z");
    memory.entries = memory.entries.map(
      (entry) => changes.find((item) => item.id === entry.id) || entry,
    );
  }),
  restoreVaultEntry: vi.fn(async (id: string) => {
    const changes = entriesToRestore(memory.entries, id);
    memory.entries = memory.entries.map(
      (entry) => changes.find((item) => item.id === entry.id) || entry,
    );
  }),
  deleteVaultEntries: vi.fn(async (ids: string[]) => {
    memory.entries = memory.entries.filter((entry) => !ids.includes(entry.id));
  }),
  saveDocument: vi.fn(async (document) => {
    memory.records = [
      ...memory.records.filter((record) => record.id !== document.id),
      { id: document.id, document, analysis: null, updatedAt: "2026-10-25" },
    ];
  }),
  saveMastery: vi.fn(async () => {}),
  savePaperFile: vi.fn(async () => {}),
  subscribeStoreChanges: vi.fn(() => () => {}),
}));
vi.mock("@/features/paper-reader/annotations-store", () => ({
  saveAnnotation: vi.fn(async () => {}),
  subscribeAnnotations: vi.fn(() => () => {}),
}));
vi.mock("@/lib/api/intelligence-client", () => ({ parseDocument: vi.fn() }));
vi.mock("@/lib/paper-pipeline", () => ({ runPaperPipeline: vi.fn(async () => ({})) }));
vi.mock("@/lib/api/chat-client", () => ({ requestChatReply: vi.fn() }));
vi.mock("@/lib/api/roadmap-client", () => ({ requestRoadmap: vi.fn() }));

import { VaultResearchService } from "./vault-service";
import { parseDocument } from "@/lib/api/intelligence-client";
import { runPaperPipeline } from "@/lib/paper-pipeline";
import { getWorkspaceState, listVaultEntries, updateWorkspaceState } from "@/lib/browser-store";
import { requestChatReply } from "@/lib/api/chat-client";
import { requestRoadmap } from "@/lib/api/roadmap-client";

beforeEach(() => {
  vi.clearAllMocks();
  memory.entries = [];
  memory.records = [];
  memory.workspace = null;
});

describe("real workspace wiring", () => {
  it("restores a deleted project with its notes and writing draft", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    const project = await service.createProject("Trash preview");
    const note = await service.saveNote({
      projectId: project.id,
      title: "Keep me",
      body: "Important notes",
      question: false,
      resolved: false,
    });
    await service.saveDraft({ body: "Preserved draft" });
    await service.trashItem(project.id, "project");
    expect(service.snapshot().projects.some((item) => item.id === project.id)).toBe(false);
    expect(service.snapshot().notes.some((item) => item.id === note.id)).toBe(false);
    expect(service.snapshot().trash).toContainEqual(
      expect.objectContaining({ id: project.id, kind: "project" }),
    );
    await service.restoreItem(project.id);
    expect(service.snapshot().notes.find((item) => item.id === note.id)?.body).toBe(
      "Important notes",
    );
    expect(service.snapshot().drafts[project.id].body).toBe("Preserved draft");
  });

  it("does not resurrect a note when an older editor autosaves after deletion", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    const note = await service.saveNote({
      projectId: service.snapshot().activeProjectId,
      title: "Old editor",
      body: "Saved",
      question: false,
      resolved: false,
    });
    await service.deleteNote(note.id);
    await expect(service.saveNote({ ...note, body: "Late write" })).rejects.toThrow("Trash");
    expect(service.snapshot().notes).toHaveLength(0);
    await service.restoreItem(note.id);
    expect(service.snapshot().notes[0].body).toBe("Saved");
  });

  it("moves saved links to persistent Trash and restores them", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    const link = await service.addLink("https://example.com", "Source preview");
    const id = await service.trashItem(link.id, "source");
    await service.refresh();
    expect(service.snapshot().documents.some((item) => item.id === link.id)).toBe(false);
    expect(service.snapshot().trash).toContainEqual(expect.objectContaining({ id: link.id }));
    await service.restoreItem(id);
    expect(service.snapshot().documents.some((item) => item.id === link.id)).toBe(true);
  });

  it("creates the research under its generated name together with its roadmap", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    const original = service.snapshot().activeProjectId;
    let finish!: (response: RoadmapResponse) => void;
    vi.mocked(requestRoadmap).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pending = service.createPlannedProject(
      "I want to understand fractional calculus in electromagnetism.",
    );
    expect(service.snapshot().projects).toHaveLength(1);
    finish(MOCK_ROADMAP_RESPONSE);
    const project = await pending;
    expect(project.name).toBe("Fractional Field Theory");
    expect(project.description).toBe(MOCK_ROADMAP_RESPONSE.data.roadmap.goal);
    expect(service.snapshot().activeProjectId).toBe(original);
    expect(service.snapshot().notes.find((note) => note.projectId === project.id)).toMatchObject({
      title: "Roadmap",
    });
    await service.setActiveProject(project.id);
    await service.refresh();
    expect(service.snapshot().projects.find((item) => item.id === project.id)?.name).toBe(
      "Fractional Field Theory",
    );
    expect(service.snapshot().activeProjectId).toBe(project.id);
  });

  it("keeps generated names unique without replacing an existing research project", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    vi.mocked(requestRoadmap)
      .mockResolvedValueOnce(MOCK_ROADMAP_RESPONSE)
      .mockResolvedValueOnce(MOCK_ROADMAP_RESPONSE);
    const first = await service.createPlannedProject("Fractional fields");
    const second = await service.createPlannedProject("More fractional fields");
    expect(first.name).toBe("Fractional Field Theory");
    expect(second.name).toBe("Fractional Field Theory 1");
    expect(first.id).not.toBe(second.id);
  });

  it("leaves no placeholder research folder when roadmap generation fails", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    vi.mocked(requestRoadmap).mockResolvedValueOnce({
      ok: false,
      error: { code: "PROVIDER_ERROR", message: "Try again" },
    });
    await expect(service.createPlannedProject("My research idea")).rejects.toThrow("Try again");
    expect(service.snapshot().projects).toHaveLength(1);
    expect(service.snapshot().notes).toHaveLength(0);
  });

  it("creates distinct untitled notes and saves edits without duplicating them", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    const input = {
      projectId: service.snapshot().activeProjectId,
      title: "Untitled",
      body: "",
      question: false,
      resolved: false,
    };
    const first = await service.saveNote(input);
    const second = await service.saveNote(input);
    expect(second.id).not.toBe(first.id);
    expect(second.title).not.toBe(first.title);
    await service.saveNote({
      ...first,
      title: "Research idea",
      body: "# A new idea\n\nWrite immediately.",
      question: true,
    });
    const notes = service.snapshot().notes;
    expect(notes).toHaveLength(2);
    expect(notes.find((note) => note.id === first.id)).toMatchObject({
      title: "Research idea",
      body: "# A new idea\n\nWrite immediately.",
      question: true,
    });
  });

  it("exposes a storage failure and clears it after a successful retry", async () => {
    const service = new VaultResearchService();
    vi.mocked(listVaultEntries).mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(service.refresh()).rejects.toThrow("Storage unavailable");
    expect(service.snapshot().loadError).toBe("Storage unavailable");
    await service.refresh();
    expect(service.snapshot().loadError).toBeUndefined();
    expect(service.snapshot().activeProjectId).not.toBe("loading");
  });

  it("starts the analysis pipeline after a newly parsed document is available", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    vi.mocked(parseDocument).mockResolvedValueOnce({
      ok: true,
      data: { document: MOCK_INGEST_SUCCESS.data },
    });
    const uploaded = await service.upload(
      new File(["# Sample"], "sample.md", { type: "text/markdown" }),
    );
    expect(uploaded.id).toBe(MOCK_INGEST_SUCCESS.data.id);
    await vi.waitFor(() =>
      expect(runPaperPipeline).toHaveBeenCalledWith(MOCK_INGEST_SUCCESS.data, expect.any(Object)),
    );
    expect(service.snapshot().documents.some((document) => document.id === uploaded.id)).toBe(true);
  });

  it("queues a refresh requested while an older snapshot is loading", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    let finish!: (value: null) => void;
    vi.mocked(getWorkspaceState).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = service.refresh();
    const second = service.refresh();
    const before = vi.mocked(listVaultEntries).mock.calls.length;
    finish(null);
    await Promise.all([first, second]);
    expect(vi.mocked(listVaultEntries).mock.calls.length).toBe(before + 1);
  });

  it("preserves simultaneous edits and does not poison later saves after a failure", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    const project = service.snapshot().activeProjectId;
    await Promise.all([
      service.saveDraft({ title: "Audit draft" }),
      service.updateDocument("paper-a", { reading: "read" }),
    ]);
    expect(memory.workspace).toMatchObject({
      drafts: { [project]: { title: "Audit draft" } },
      documents: { "paper-a": { reading: "read" } },
    });
    vi.mocked(updateWorkspaceState).mockRejectedValueOnce(new Error("Disk full"));
    await expect(service.saveDraft({ title: "Lost write" })).rejects.toThrow("Disk full");
    await service.saveDraft({ title: "Recovered" });
    expect(service.snapshot().draft.title).toBe("Recovered");
  });

  it("does not change the active project while a prompt's roadmap is being planned", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    const original = service.snapshot().activeProjectId;
    const planned = await service.createProject("Planned research", "A research question", false);
    expect(service.snapshot().activeProjectId).toBe(original);
    expect(service.snapshot().projects.some((project) => project.id === planned.id)).toBe(true);
    await service.setActiveProject(planned.id);
    expect(service.snapshot().activeProjectId).toBe(planned.id);
  });

  it("rejects missing document or passage context instead of silently answering from the project", async () => {
    const service = new VaultResearchService();
    await service.refresh();
    await expect(service.ask("Explain", "document")).rejects.toThrow("Open a saved paper");
    await expect(
      service.ask("Explain", "selection", { documentId: "missing", quote: "Quote" }),
    ).rejects.toThrow("Open a saved paper");
    expect(requestChatReply).not.toHaveBeenCalled();
    expect(service.snapshot().conversation.messages).toHaveLength(0);
  });
});

it("persists demo data idempotently and clears it while rescuing real notes", async () => {
  vi.stubEnv("NODE_ENV", "development");
  try {
    const service = new VaultResearchService();
    await service.refresh();
    const realProject = service.snapshot().projects[0].id;
    await service.manageTestData(true);
    await service.manageTestData(true);
    expect(service.snapshot().projects).toHaveLength(11);
    expect(service.snapshot().documents).toHaveLength(60);
    expect(service.snapshot().notes).toHaveLength(70);
    expect(service.snapshot().claims).toHaveLength(30);
    const demoProject = service
      .snapshot()
      .projects.find((p) => p.id.startsWith("demo-research-v1-"))!;
    await service.setActiveProject(demoProject.id);
    const note = await service.saveNote({
      projectId: demoProject.id,
      title: "My real observation",
      body: "Keep my work",
      question: false,
      resolved: false,
    });
    const reloaded = new VaultResearchService();
    await reloaded.refresh();
    expect(reloaded.snapshot().documents).toHaveLength(60);
    await reloaded.manageTestData(false);
    expect(reloaded.snapshot().projects.map((p) => p.id)).toEqual([realProject]);
    expect(reloaded.snapshot().documents).toHaveLength(0);
    expect(reloaded.snapshot().claims).toHaveLength(0);
    expect(reloaded.snapshot().notes.find((n) => n.id === note.id)?.body).toBe("Keep my work");
    expect(reloaded.snapshot().notes.find((n) => n.id === note.id)?.projectId).toBe(realProject);
  } finally {
    vi.unstubAllEnvs();
  }
});

it("recovers authored writing from demo projects when clearing", async () => {
  vi.stubEnv("NODE_ENV", "development");
  try {
    const service = new VaultResearchService();
    await service.refresh();
    await service.manageTestData(true);
    const demo = service.snapshot().projects.find((p) => p.id.startsWith("demo-research-v1-"))!;
    await service.setActiveProject(demo.id);
    await service.saveDraft({ title: "My authored draft", body: "Retain this writing" });
    await service.manageTestData(false);
    const recovered = service.snapshot().projects.find((p) => p.name.startsWith("Recovered ·"))!;
    expect(recovered).toBeDefined();
    expect(service.snapshot().drafts[recovered.id].body).toBe("Retain this writing");
    expect(
      Object.keys(service.snapshot().drafts).some((id) => id.startsWith("demo-research-v1-")),
    ).toBe(false);
  } finally {
    vi.unstubAllEnvs();
  }
});
