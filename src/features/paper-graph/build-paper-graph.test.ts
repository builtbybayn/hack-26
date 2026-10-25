import { expect, it } from "vitest";
import type { DocumentRecord, ResearchProject } from "@/lib/browser-store";
import { buildPaperGraph } from "./build-paper-graph";

const records = [
  {
    id: "a",
    document: { title: "Paper A", source: { fileName: "a.pdf" } },
    analysis: { understanding: { topics: ["Vector calculus"] } },
  },
  {
    id: "b",
    document: { title: "Paper B", source: { fileName: "b.pdf" } },
    analysis: { understanding: { topics: ["Vector calculus"] } },
  },
] as DocumentRecord[];

const project = {
  id: "project",
  name: "Vectors",
  notes: "",
  documentIds: ["a", "b"],
  papers: [
    {
      id: "openalex:W1",
      title: "A guide to vector calculus",
      authors: [],
      provider: "openalex",
      url: "https://openalex.org/W1",
    },
  ],
  synthesis: {
    createdAt: "2026-10-24T00:00:00.000Z",
    documentIds: ["a", "b"],
    warnings: [],
    findings: [
      {
        kind: "agreement",
        theme: "Gradient",
        summary: "Both agree",
        assessment: { verdict: "supported", reason: "Both papers support the finding." },
        evidence: [
          {
            documentId: "a",
            pageNumber: 1,
            quote: "Gradient is useful.",
            assessment: { verdict: "supported", reason: "Paper A supports its part." },
          },
          {
            documentId: "b",
            pageNumber: 2,
            quote: "Gradient is useful.",
            assessment: { verdict: "supported", reason: "Paper B supports its part." },
          },
        ],
      },
    ],
  },
  updatedAt: "2026-10-24T00:00:00.000Z",
} as ResearchProject;

it("connects papers with verified synthesis evidence and marks text overlap as inferred", () => {
  const graph = buildPaperGraph(project, records);
  expect(graph.nodes).toHaveLength(3);
  const agreement = graph.edges.find((edge) => edge.kind === "agreement");
  expect(agreement).toMatchObject({
    source: "doc:a",
    target: "doc:b",
    evidence: project.synthesis?.findings[0].evidence,
  });
  expect(graph.edges.filter((edge) => edge.kind === "shared_topic")).toHaveLength(3);
});

it("withholds agreement edges when a source or combined finding is not supported", () => {
  const finding = project.synthesis!.findings[0];
  const unchecked = buildPaperGraph(
    {
      ...project,
      synthesis: {
        ...project.synthesis!,
        findings: [{ ...finding, assessment: { verdict: "unclear", reason: "Not established." } }],
      },
    },
    records,
  );
  expect(unchecked.edges.some((edge) => edge.kind === "agreement")).toBe(false);
  const weakSource = buildPaperGraph(
    {
      ...project,
      synthesis: {
        ...project.synthesis!,
        findings: [
          {
            ...finding,
            evidence: finding.evidence.map((item, index) =>
              index === 1
                ? { ...item, assessment: { verdict: "contradicted", reason: "Opposes it." } }
                : item,
            ),
          },
        ],
      },
    },
    records,
  );
  expect(weakSource.edges.some((edge) => edge.kind === "agreement")).toBe(false);
});

it("does not infer an edge from unrelated paper text", () => {
  const unrelated = {
    ...project,
    papers: [{ ...project.papers[0], title: "Marine ecology", abstract: "Ocean species" }],
  };
  const graph = buildPaperGraph(unrelated, records);
  expect(
    graph.edges.some(
      (edge) => edge.source === "paper:openalex:W1" || edge.target === "paper:openalex:W1",
    ),
  ).toBe(false);
});

it("adds directional citations only when both OpenAlex papers are saved", () => {
  const citing = {
    ...project.papers[0],
    referencedWorkIds: ["openalex:W2", "openalex:W2", "openalex:W99"],
  };
  const cited = { ...project.papers[0], id: "openalex:W2", title: "Earlier work" };
  const graph = buildPaperGraph({ ...project, documentIds: [], papers: [citing, cited] }, []);
  expect(graph.edges.filter((edge) => edge.kind === "citation")).toEqual([
    {
      id: "citation:openalex:W1:openalex:W2",
      source: "paper:openalex:W1",
      target: "paper:openalex:W2",
      kind: "citation",
      label: "OpenAlex reference",
      evidence: [],
    },
  ]);
});
