import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentRecord } from "@/lib/browser-store";
import type { DocumentAnalysis } from "@/types/intelligence";
import type { ParsedDocument } from "@/types/ingestion";
import { runPaperPipeline, topicsOverlap } from "./paper-pipeline";

// An in-memory stand-in for IndexedDB.
const store = vi.hoisted(() => new Map<string, unknown>());
vi.mock("@/lib/browser-store", () => ({
  saveDocument: async (document: ParsedDocument) => {
    const existing = store.get(document.id) as object | undefined;
    store.set(document.id, { analysis: null, ...existing, id: document.id, document });
  },
  savePaperFile: async () => {},
  getDocumentRecord: async (id: string) => store.get(id) ?? null,
  listDocumentRecords: async () => [...store.values()],
  updateDocumentRecord: async (id: string, patch: object) => {
    // Yield like IndexedDB does, so concurrent writers would interleave without the queue.
    await new Promise((resolve) => setTimeout(resolve, 1));
    const updated = { ...(store.get(id) as object), ...patch };
    store.set(id, updated);
    return updated;
  },
}));

const api = vi.hoisted(() => ({
  analyze: vi.fn(),
  recommend: vi.fn(),
  contradict: vi.fn(),
}));
vi.mock("@/lib/api/intelligence-client", () => ({ analyzeDocument: api.analyze }));
vi.mock("@/lib/api/research-client", () => ({ requestRecommendations: api.recommend }));
vi.mock("@/lib/api/contradictions-client", () => ({ requestContradictions: api.contradict }));

const paper = (id: string) => ({ id, title: id, source: { fileName: id } }) as ParsedDocument;
const analysis = (subject: string, topics: string[]) =>
  ({
    understanding: { subject, topics },
    graph: { documentId: "x" },
  }) as unknown as DocumentAnalysis;

const LONG_ABSTRACT = "We measure how attention heads change translation quality. ".repeat(6);
const published = (id: string, kind: "related" | "background", abstract?: string) => ({
  kind,
  conceptIds: [],
  reason: null,
  paper: { id, title: `Published ${id}`, authors: [], url: `https://openalex.org/${id}`, abstract },
});

beforeEach(() => {
  store.clear();
  vi.resetAllMocks();
  // No abstracts, so only saved papers can be compared unless a test supplies some.
  api.recommend.mockResolvedValue({
    ok: true,
    data: {
      recommendations: [published("W1", "related"), published("W2", "related")],
      queries: [],
    },
  });
  api.contradict.mockResolvedValue({ ok: true, data: { documentIds: [], findings: [{}] } });
});

describe("runPaperPipeline", () => {
  it("saves, analyzes, then finds related papers and checks contradictions", async () => {
    store.set("other", {
      id: "other",
      document: paper("other"),
      analysis: analysis("Neural networks", ["attention mechanisms"]),
    });
    api.analyze.mockResolvedValue({
      ok: true,
      data: { analysis: analysis("Transformers", ["attention mechanisms", "translation"]) },
    });

    const updates: DocumentRecord[] = [];
    const record = await runPaperPipeline(paper("new"), { onUpdate: (r) => updates.push(r) });

    expect(record.pipeline).toEqual({
      saved: { status: "done" },
      analysis: { status: "done" },
      recommendations: { status: "done", message: "2 papers found." },
      contradictions: { status: "done", message: "1 possible conflict with 1 saved paper." },
    });
    // Both results survive in the stored record.
    expect(store.get("new")).toMatchObject({
      recommendations: { recommendations: [{ paper: { id: "W1" } }, { paper: { id: "W2" } }] },
      contradictions: { findings: [{}] },
    });
    expect(api.contradict.mock.calls[0][0].documents.map((d: ParsedDocument) => d.id)).toEqual([
      "new",
      "other",
    ]);
    expect(updates.some((r) => r.pipeline?.analysis.status === "running")).toBe(true);
  });

  it("skips the dependent steps when analysis fails", async () => {
    api.analyze.mockResolvedValue({ ok: false, error: { message: "Gemini is not configured." } });
    const record = await runPaperPipeline(paper("new"));
    expect(record.pipeline?.analysis).toEqual({
      status: "failed",
      message: "Gemini is not configured.",
    });
    expect(record.pipeline?.recommendations.status).toBe("skipped");
    expect(api.recommend).not.toHaveBeenCalled();
    expect(store.get("new")).toBeDefined(); // still saved to the vault
  });

  it("compares with published papers found by the search, by abstract", async () => {
    api.analyze.mockResolvedValue({
      ok: true,
      data: { analysis: analysis("Transformers", ["attention"]) },
    });
    api.recommend.mockResolvedValue({
      ok: true,
      data: {
        recommendations: [
          published("B1", "background", LONG_ABSTRACT),
          published("R1", "related", LONG_ABSTRACT),
          published("R2", "related", "Too short to compare."),
          published("R3", "related", LONG_ABSTRACT),
        ],
        queries: [],
      },
    });
    const record = await runPaperPipeline(paper("new"));

    const request = api.contradict.mock.calls[0][0];
    // Closest work first, short abstracts skipped, up to three papers.
    expect(request.documents.map((d: ParsedDocument) => d.id)).toEqual(["new", "R1", "R3", "B1"]);
    expect(request.documents[1].pages).toEqual([{ pageNumber: 1, text: LONG_ABSTRACT.trim() }]);
    expect(request.analyses).toBeUndefined(); // published papers have no analysis
    expect(record.pipeline?.contradictions.message).toBe(
      "1 possible conflict with 3 published papers.",
    );
    expect(record.contradictions?.sources?.[1]).toEqual({
      documentId: "R1",
      title: "Published R1",
      kind: "literature",
      url: "https://openalex.org/R1",
    });
  });

  it("skips the contradiction check with nothing to compare against", async () => {
    store.set("other", {
      id: "other",
      document: paper("other"),
      analysis: analysis("Ancient history", ["roman empire"]),
    });
    api.analyze.mockResolvedValue({
      ok: true,
      data: { analysis: analysis("Transformers", ["attention"]) },
    });
    const record = await runPaperPipeline(paper("new"));
    expect(record.pipeline?.contradictions.status).toBe("skipped");
    expect(api.contradict).not.toHaveBeenCalled();
  });

  it("reuses a saved analysis instead of calling Gemini again", async () => {
    store.set("new", {
      id: "new",
      document: paper("new"),
      analysis: analysis("Transformers", ["attention"]),
    });
    await runPaperPipeline(paper("new"));
    expect(api.analyze).not.toHaveBeenCalled();
  });
});

describe("topicsOverlap", () => {
  it("ignores generic words", () => {
    expect(
      topicsOverlap(analysis("A study", ["methods"]), analysis("Another study", ["methods"])),
    ).toBe(false);
    expect(
      topicsOverlap(analysis("Vision", ["convolution"]), analysis("Audio", ["convolution"])),
    ).toBe(true);
  });
});
