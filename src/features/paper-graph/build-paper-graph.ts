import type { DocumentRecord, ResearchProject } from "@/lib/browser-store";
import type { SynthesisEvidence } from "@/types/synthesis";
import { isSupportedFinding } from "@/lib/synthesis/evidence-status";

export interface PaperGraphNode {
  id: string;
  label: string;
  kind: "analyzed" | "saved";
  url?: string;
}

export interface PaperGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: "agreement" | "disagreement" | "shared_topic" | "citation";
  label: string;
  evidence: SynthesisEvidence[];
}

function normalize(value: string) {
  return ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

export function buildPaperGraph(
  project: ResearchProject,
  records: DocumentRecord[],
): {
  nodes: PaperGraphNode[];
  edges: PaperGraphEdge[];
} {
  const attached = project.documentIds.flatMap((id) =>
    records.filter((record) => record.id === id),
  );
  const nodes: PaperGraphNode[] = [
    ...attached.map((record) => ({
      id: `doc:${record.id}`,
      label: record.document.title ?? record.document.source.fileName,
      kind: "analyzed" as const,
    })),
    ...project.papers.map((paper) => ({
      id: `paper:${paper.id}`,
      label: paper.title,
      kind: "saved" as const,
      url: paper.url,
    })),
  ];
  const edges: PaperGraphEdge[] = [];
  const savedIds = new Set(project.papers.map((paper) => paper.id));
  for (const paper of project.papers) {
    for (const citedId of new Set(paper.referencedWorkIds ?? [])) {
      if (citedId === paper.id || !savedIds.has(citedId)) continue;
      edges.push({
        id: `citation:${paper.id}:${citedId}`,
        source: `paper:${paper.id}`,
        target: `paper:${citedId}`,
        kind: "citation",
        label: "OpenAlex reference",
        evidence: [],
      });
    }
  }
  for (const [index, finding] of (project.synthesis?.findings ?? []).entries()) {
    if (finding.kind === "open_question" || !isSupportedFinding(finding)) continue;
    const ids = [...new Set(finding.evidence.map((item) => item.documentId))].filter((id) =>
      attached.some((record) => record.id === id),
    );
    for (let first = 0; first < ids.length; first += 1) {
      for (let second = first + 1; second < ids.length; second += 1) {
        edges.push({
          id: `synthesis:${index}:${ids[first]}:${ids[second]}`,
          source: `doc:${ids[first]}`,
          target: `doc:${ids[second]}`,
          kind: finding.kind === "agreement" ? "agreement" : "disagreement",
          label: finding.theme,
          evidence: finding.evidence.filter(
            (item) => item.documentId === ids[first] || item.documentId === ids[second],
          ),
        });
      }
    }
  }
  const topics = [
    ...new Set(
      attached
        .flatMap((record) => record.analysis?.understanding.topics ?? [])
        .map((topic) => normalize(topic).trim())
        .filter((topic) => topic.length >= 6),
    ),
  ].slice(0, 40);
  const nodeTopics = new Map(
    nodes.map((node) => {
      const record = attached.find((item) => `doc:${item.id}` === node.id);
      const paper = project.papers.find((item) => `paper:${item.id}` === node.id);
      const matched = record
        ? (record.analysis?.understanding.topics ?? [])
            .map((topic) => normalize(topic).trim())
            .filter((topic) => topics.includes(topic))
        : topics.filter((topic) =>
            normalize(`${paper?.title ?? ""} ${paper?.abstract ?? ""}`).includes(` ${topic} `),
          );
      return [node.id, new Set(matched)] as const;
    }),
  );
  for (let first = 0; first < nodes.length; first += 1) {
    for (let second = first + 1; second < nodes.length; second += 1) {
      const shared = [...(nodeTopics.get(nodes[first].id) ?? [])]
        .filter((topic) => nodeTopics.get(nodes[second].id)?.has(topic))
        .slice(0, 3);
      if (shared.length)
        edges.push({
          id: `topic:${nodes[first].id}:${nodes[second].id}`,
          source: nodes[first].id,
          target: nodes[second].id,
          kind: "shared_topic",
          label: shared.join(", "),
          evidence: [],
        });
    }
  }
  return { nodes, edges };
}
