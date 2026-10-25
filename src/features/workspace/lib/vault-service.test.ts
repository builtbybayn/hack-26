import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentRecord } from "@/lib/browser-store";
import type { VaultEntry } from "@/types/vault";
import { MOCK_INGEST_SUCCESS } from "@/lib/api/ingest-mock";
import { MOCK_ROADMAP_RESPONSE } from "@/lib/api/roadmap-mock";
import type { RoadmapResponse } from "@/types/roadmap";

const memory = vi.hoisted(() => ({
  entries: [] as VaultEntry[],
  records: [] as DocumentRecord[],
  workspace: null as unknown,
}));
vi.mock("@/lib/browser-store", () => ({
  listVaultEntries: vi.fn(async () => structuredClone(memory.entries)),
  listDocumentRecords: vi.fn(async () => structuredClone(memory.records)),
  listAllAnnotations: vi.fn(async () => []),
  loadMastery: vi.fn(async () => ({})),
  getWorkspaceState: vi.fn(async () => structuredClone(memory.workspace)),
  updateWorkspaceState: vi.fn(async (update) => {
    memory.workspace = update(structuredClone(memory.workspace));
    return structuredClone(memory.workspace);
  }),
  putVaultEntries: vi.fn(async (entries: VaultEntry[]) => {
    for (const entry of entries)
      memory.entries = [...memory.entries.filter((item) => item.id !== entry.id), entry];
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
