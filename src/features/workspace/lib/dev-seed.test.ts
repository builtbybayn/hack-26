import { describe, expect, it } from "vitest";
import { loadDemo, clearDemo, DEMO_PREFIX } from "./dev-seed";
import { buildKnowledgeGraph } from "./knowledge-graph";
import type { WorkspaceData } from "./models";
const blank = () =>
  ({
    projects: [{ id: "real", name: "Real research", description: "", updatedAt: "" }],
    documents: [],
    notes: [],
    concepts: [],
    claims: [],
    findings: [],
    annotations: [],
    drafts: {},
    conversations: {},
    chatHistory: {},
    uploads: [],
    activeProjectId: "real",
    draft: {
      id: "draft",
      projectId: "real",
      title: "",
      abstract: "",
      body: "",
      authors: "",
      citations: [],
      updatedAt: "",
      style: "APA 7",
    },
    conversation: { id: "chat", projectId: "real", messages: [] },
  }) as WorkspaceData;
describe("development research corpus", () => {
  it("builds a connected, resolvable corpus without duplicates or changing real records", () => {
    const original = blank();
    const data = loadDemo(original);
    expect(loadDemo(data)).toEqual(data);
    expect(original.projects).toHaveLength(1);
    expect(data.projects).toHaveLength(11);
    expect(data.documents).toHaveLength(60);
    expect(data.notes).toHaveLength(70);
    const graph = buildKnowledgeGraph(data);
    expect(graph.nodes.filter((n) => n.sourceId.startsWith(DEMO_PREFIX))).toHaveLength(260);
    const ids = new Set(graph.nodes.map((n) => n.id));
    expect(graph.edges.every((e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId))).toBe(true);
    expect(graph.edges.filter((e) => e.origin === "seeded")).toHaveLength(10);
    expect(graph.edges.length).toBeGreaterThan(450);
    expect(clearDemo(data)).toEqual(original);
    expect(buildKnowledgeGraph(original).edges.every((e) => e.origin === "explicit")).toBe(true);
  });
});
