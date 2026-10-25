"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { requestCitationReferences } from "@/lib/api/citations-client";
import { isSupportedFinding } from "@/lib/synthesis/evidence-status";
import {
  listDocumentRecords,
  type DocumentRecord,
  type ResearchProject,
} from "@/lib/browser-store";
import { buildPaperGraph } from "./build-paper-graph";
import styles from "./paper-graph.module.css";

export function PaperGraph({
  project,
  onSaveReferences,
}: {
  project: ResearchProject;
  onSaveReferences: (references: Record<string, string[]>) => Promise<boolean>;
}) {
  const [records, setRecords] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedNode, setSelectedNode] = useState("");
  const [selectedEdge, setSelectedEdge] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");

  useEffect(() => {
    listDocumentRecords()
      .then(setRecords)
      .catch(() => setError("Stored documents could not be loaded for the graph."))
      .finally(() => setLoading(false));
  }, [project.documentIds]);

  const graph = useMemo(() => buildPaperGraph(project, records), [project, records]);
  const withheldRelationships =
    project.synthesis?.findings.filter(
      (finding) => finding.kind !== "open_question" && !isSupportedFinding(finding),
    ).length ?? 0;
  const analyzedCount = graph.nodes.filter((node) => node.kind === "analyzed").length;
  const flowNodes: Node[] = graph.nodes.map((node, index) => ({
    id: node.id,
    position: {
      x: node.kind === "analyzed" ? 0 : 350,
      y: (node.kind === "analyzed" ? index : index - analyzedCount) * 120,
    },
    data: { label: node.label },
    className: node.kind === "analyzed" ? styles.analyzed : styles.saved,
  }));
  const flowEdges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label:
      edge.kind === "shared_topic"
        ? "Topic"
        : edge.kind === "agreement"
          ? "Agrees"
          : edge.kind === "disagreement"
            ? "Differs"
            : "Cites",
    style: {
      stroke:
        edge.kind === "shared_topic" ? "#a55f3c" : edge.kind === "citation" ? "#15231d" : "#294f3d",
      strokeWidth: edge.kind === "shared_topic" ? 1.5 : 2.5,
      strokeDasharray: edge.kind === "shared_topic" ? "5 4" : undefined,
    },
    markerEnd:
      edge.kind === "citation" ? { type: MarkerType.ArrowClosed, color: "#15231d" } : undefined,
  }));
  const node = graph.nodes.find((item) => item.id === selectedNode);
  const edge = graph.edges.find((item) => item.id === selectedEdge);

  function selectNode(id: string) {
    setSelectedNode(id);
    setSelectedEdge("");
  }
  function selectEdge(id: string) {
    setSelectedEdge(id);
    setSelectedNode("");
  }

  async function refreshReferences() {
    const paperIds = project.papers
      .filter((paper) => paper.provider === "openalex" && /^openalex:W\d+$/.test(paper.id))
      .map((paper) => paper.id);
    if (!paperIds.length) return;
    setRefreshing(true);
    setRefreshMessage("");
    const result = await requestCitationReferences({ paperIds });
    if (!result.ok) setRefreshMessage(result.error.message);
    else {
      try {
        const saved = await onSaveReferences(result.data.references);
        setRefreshMessage(
          saved
            ? `Updated citation data for ${Object.keys(result.data.references).length} papers.`
            : "Citation data could not be saved in this browser.",
        );
      } catch {
        setRefreshMessage("Citation data could not be saved in this browser.");
      }
    }
    setRefreshing(false);
  }

  return (
    <section className={styles.panel} aria-labelledby="paper-graph-heading">
      <span className="step">PAPER KNOWLEDGE GRAPH</span>
      <h2 id="paper-graph-heading">How these papers connect</h2>
      <p>
        Solid green links come from supported synthesis findings. Dashed clay links show topic
        overlap inferred from titles, abstracts, or analyzed topics. Black arrows show OpenAlex
        citation references between saved papers.
      </p>
      {withheldRelationships > 0 && (
        <p role="status">
          {withheldRelationships} synthesis relationship{withheldRelationships === 1 ? "" : "s"}{" "}
          withheld because the interpretation is unchecked or disputed. Regenerate the synthesis to
          recheck it.
        </p>
      )}
      {project.papers.some(
        (paper) => paper.provider === "openalex" && /^openalex:W\d+$/.test(paper.id),
      ) && (
        <button className="secondary" disabled={refreshing} onClick={refreshReferences}>
          {refreshing ? "Loading citations…" : "Refresh citation links"}
        </button>
      )}
      {refreshMessage && <p role="status">{refreshMessage}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading project papers…</p>
      ) : graph.nodes.length ? (
        <>
          <div className={styles.flow} aria-label="Paper relationship graph">
            <ReactFlow
              nodes={flowNodes}
              edges={flowEdges}
              fitView
              minZoom={0.3}
              maxZoom={1.5}
              nodesDraggable={false}
              nodesConnectable={false}
              onNodeClick={(_, clicked) => selectNode(clicked.id)}
              onEdgeClick={(_, clicked) => selectEdge(clicked.id)}
            >
              <Background color="#d8d4cb" gap={24} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </div>
          <div className={styles.listGrid}>
            <div>
              <h3>Papers</h3>
              <ul>
                {graph.nodes.map((item) => (
                  <li key={item.id}>
                    <button onClick={() => selectNode(item.id)}>{item.label}</button>
                    <small>
                      {item.kind === "analyzed" ? "Analyzed document" : "Saved scholarly record"}
                    </small>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3>Relationships</h3>
              {graph.edges.length ? (
                <ul>
                  {graph.edges.map((item) => (
                    <li key={item.id}>
                      <button onClick={() => selectEdge(item.id)}>
                        {graph.nodes.find((node) => node.id === item.source)?.label}{" "}
                        {item.kind === "citation" ? "→" : "↔"}{" "}
                        {graph.nodes.find((node) => node.id === item.target)?.label}
                      </button>
                      <small>
                        {item.kind.replace("_", " ")}: {item.label}
                      </small>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No relationships identified from the available evidence and topics.</p>
              )}
            </div>
          </div>
          {(node || edge) && (
            <aside className={styles.detail} aria-live="polite">
              {node && (
                <>
                  <h3>{node.label}</h3>
                  <p>{node.kind === "analyzed" ? "Analyzed document" : "Saved scholarly record"}</p>
                  {node.url && (
                    <a href={node.url} target="_blank" rel="noopener noreferrer">
                      Open paper record
                    </a>
                  )}
                  {node.kind === "analyzed" && (
                    <Link href={`/?document=${encodeURIComponent(node.id.slice(4))}`}>
                      Open analyzed document
                    </Link>
                  )}
                </>
              )}
              {edge && (
                <>
                  <h3>
                    {edge.kind === "citation"
                      ? "Citation"
                      : edge.kind === "shared_topic"
                        ? "Shared topic"
                        : edge.kind === "agreement"
                          ? "Agreement"
                          : "Difference"}
                    : {edge.label}
                  </h3>
                  <p>
                    {edge.kind === "citation"
                      ? "OpenAlex lists the target paper among the source paper’s referenced works. Missing links may reflect incomplete provider reference data."
                      : edge.kind === "shared_topic"
                        ? "Inferred from matching topic text; this does not establish a citation or agreement."
                        : "Relationship from the saved synthesis, supported by these page passages."}
                  </p>
                  {edge.evidence.map((item, index) => {
                    const document = records.find(
                      (record) => record.id === item.documentId,
                    )?.document;
                    const page = document?.pages.find(
                      (entry) => entry.pageNumber === item.pageNumber,
                    );
                    return (
                      <details key={`${item.documentId}-${item.pageNumber}-${index}`}>
                        <summary>
                          {document?.title ?? document?.source.fileName ?? "Document"}, page{" "}
                          {item.pageNumber}: “{item.quote}”
                        </summary>
                        <pre>{page?.text ?? "Stored page text unavailable."}</pre>
                      </details>
                    );
                  })}
                </>
              )}
            </aside>
          )}
        </>
      ) : (
        <p>Attach analyzed documents or save recommended papers to build this graph.</p>
      )}
    </section>
  );
}
