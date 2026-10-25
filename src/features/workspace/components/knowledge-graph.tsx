"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/features/workspace/lib/workspace-context";
import { useKnowledge } from "@/features/workspace/lib/knowledge-context";
import { overlaps, shortLabel, type LabelRect } from "@/features/workspace/lib/graph-labels";
import type { KnowledgeNode } from "@/features/workspace/lib/knowledge-graph";
import {
  createGraphLayout,
  stepGraphLayout,
  fitGraphPoints,
  type GraphPoint as Point,
  type GraphLayout,
} from "@/features/workspace/lib/graph-layout";
export function KnowledgeGraph({
  onOpen,
}: {
  onOpen: (node: KnowledgeNode, other: boolean) => void;
}) {
  const { data, service, setNotice } = useWorkspace(),
    { graph, busy, status, rebuild, review, cancel, analyzeDemo, setAnalyzeDemo } = useKnowledge();
  const layout = useRef<GraphLayout | null>(null),
    cameraTarget = useRef<{ x: number; y: number; z: number } | null>(null);
  const [labels, setLabels] = useState(true);
  const [mode, setMode] = useState<"project" | "brain">("project"),
    [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [project, setProject] = useState(""),
    [relation, setRelation] = useState(""),
    [selected, setSelected] = useState(""),
    [edgeId, setEdgeId] = useState(""),
    [focus, setFocus] = useState(""),
    [details, setDetails] = useState(true),
    [suggestions, setSuggestions] = useState(true);
  const canvas = useRef<HTMLCanvasElement>(null),
    points = useRef(new Map<string, Point>()),
    camera = useRef({ x: 0, y: 0, z: 1 }),
    size = useRef({ w: 800, h: 600 }),
    drag = useRef<{ id?: string; x: number; y: number; moved: boolean } | null>(null),
    hover = useRef(""),
    tick = useRef(0);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.toLowerCase()), 180);
    return () => clearTimeout(timer);
  }, [query]);
  const edges = useMemo(
    () =>
      graph.edges.filter(
        (e) =>
          !["rejected", "hidden"].includes(e.reviewStatus) &&
          (suggestions || e.reviewStatus !== "suggested") &&
          (!relation || e.relationshipType === relation),
      ),
    [graph.edges, suggestions, relation],
  );
  const visible = useMemo(() => {
    let nodes = graph.nodes.filter(
      (n) =>
        (mode === "brain" || n.projectId === data.activeProjectId) &&
        (!type || n.type === type) &&
        (!search || `${n.title} ${n.summary}`.toLowerCase().includes(search)),
    );
    if (project) {
      const owned = new Set(graph.nodes.filter((n) => n.projectId === project).map((n) => n.id));
      const neighbors = new Set(
        edges.flatMap((e) =>
          owned.has(e.sourceNodeId) || owned.has(e.targetNodeId)
            ? [e.sourceNodeId, e.targetNodeId]
            : [],
        ),
      );
      nodes = nodes.filter((n) => owned.has(n.id) || neighbors.has(n.id));
    }
    if (focus) {
      const neighbors = new Set([
        focus,
        ...edges.flatMap((e) =>
          e.sourceNodeId === focus
            ? [e.targetNodeId]
            : e.targetNodeId === focus
              ? [e.sourceNodeId]
              : [],
        ),
      ]);
      nodes = nodes.filter((n) => neighbors.has(n.id));
    }
    return nodes;
  }, [graph.nodes, edges, mode, data.activeProjectId, type, search, project, focus]);
  const visibleIds = useMemo(() => new Set(visible.map((n) => n.id)), [visible]);
  const links = useMemo(
    () => edges.filter((e) => visibleIds.has(e.sourceNodeId) && visibleIds.has(e.targetNodeId)),
    [edges, visibleIds],
  );
  const degrees = useMemo(() => {
    const result = new Map<string, number>();
    links.forEach((e) => {
      result.set(e.sourceNodeId, (result.get(e.sourceNodeId) || 0) + 1);
      result.set(e.targetNodeId, (result.get(e.targetNodeId) || 0) + 1);
    });
    return result;
  }, [links]);
  const labelOrder = useMemo(
    () =>
      [...visible].sort(
        (a, b) =>
          (b.type === "project" ? 100 : 0) +
          (degrees.get(b.id) || 0) -
          (a.type === "project" ? 100 : 0) -
          (degrees.get(a.id) || 0),
      ),
    [visible, degrees],
  );
  const current = graph.nodes.find((n) => n.id === selected),
    edge = graph.edges.find((e) => e.id === edgeId);
  const centerGraph = useCallback(
    (nodes = visible) => {
      cameraTarget.current = fitGraphPoints(
        nodes.map((n) => points.current.get(n.id)!).filter(Boolean),
        size.current.w,
        size.current.h,
      );
    },
    [visible],
  );
  useEffect(() => {
    layout.current = createGraphLayout(visible);
    points.current = layout.current.points;
    hover.current = "";
    tick.current = 0;
    centerGraph();
  }, [visible, links, mode, centerGraph]);
  useEffect(() => {
    const node = graph.nodes.find((n) => n.id === selected);
    if (node?.type === "project") {
      const cluster = visible.filter((n) => n.projectId === node.projectId);
      const target = fitGraphPoints(
        cluster.map((n) => points.current.get(n.id)!).filter(Boolean),
        Math.max(220, size.current.w - 300),
        size.current.h,
      );
      cameraTarget.current = { ...target, x: target.x - 120 };
    }
  }, [selected, visible, graph.nodes]);
  useEffect(() => {
    const element = canvas.current!;
    let frame = 0;
    const ctx = element.getContext("2d")!;
    const clearOutsideHover = (event: PointerEvent) => {
      if (event.target !== element) {
        hover.current = "";
        element.title = "";
      }
    };
    window.addEventListener("pointerdown", clearOutsideHover, true);
    const resize = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      size.current = { w: rect.width, h: rect.height };
      const dpr = Math.min(devicePixelRatio, 2);
      element.width = rect.width * dpr;
      element.height = rect.height * dpr;
      if (!selected) centerGraph();
    });
    resize.observe(element);
    const draw = () => {
      frame = requestAnimationFrame(draw);
      if (!element.checkVisibility()) return;
      const { w, h } = size.current,
        dpr = Math.min(devicePixelRatio, 2),
        cam = camera.current;
      if (tick.current < 300 && layout.current) {
        const motion = stepGraphLayout(layout.current, visible, links, drag.current?.id);
        tick.current++;
        if (tick.current > 80 && motion < 0.002) tick.current = 300;
      }
      const goal = cameraTarget.current;
      if (goal) {
        const blend = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 0.12;
        cam.x += (goal.x - cam.x) * blend;
        cam.y += (goal.y - cam.y) * blend;
        cam.z += (goal.z - cam.z) * blend;
        if (Math.abs(goal.x - cam.x) + Math.abs(goal.y - cam.y) + Math.abs(goal.z - cam.z) < 0.02) {
          Object.assign(cam, goal);
          cameraTarget.current = null;
        }
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#191919";
      ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2 + cam.x, h / 2 + cam.y);
      ctx.scale(cam.z, cam.z);
      const highlighted = hover.current || selected;
      const focusNode = visible.find((n) => n.id === highlighted);
      const associated = new Set(
        focusNode?.type === "project"
          ? visible.filter((n) => n.projectId === focusNode.projectId).map((n) => n.id)
          : highlighted
            ? [highlighted]
            : [],
      );
      const connected = new Set(
        links.flatMap((e) =>
          associated.has(e.sourceNodeId)
            ? [e.targetNodeId]
            : associated.has(e.targetNodeId)
              ? [e.sourceNodeId]
              : [],
        ),
      );
      const relevant = (id: string) => associated.has(id) || connected.has(id);
      links.forEach((e) => {
        const a = points.current.get(e.sourceNodeId),
          b = points.current.get(e.targetNodeId);
        if (!a || !b) return;
        const active =
          e.id === edgeId || associated.has(e.sourceNodeId) || associated.has(e.targetNodeId);
        ctx.globalAlpha = active
          ? e.relationshipType === "owns"
            ? 0.26
            : 0.8
          : highlighted
            ? 0.045
            : e.relationshipType === "owns"
              ? 0.12
              : 0.2;
        ctx.strokeStyle = active ? "#D4AF67" : "#969696";
        ctx.lineWidth = (active ? 1.15 : 0.65) / cam.z;
        ctx.setLineDash(e.reviewStatus === "suggested" ? [4 / cam.z, 5 / cam.z] : []);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      visible.forEach((n) => {
        const p = points.current.get(n.id);
        if (!p) return;
        ctx.globalAlpha = highlighted && !relevant(n.id) ? 0.22 : 1;
        ctx.fillStyle = n.type === "project" ? "#D4AF67" : "#E5E5E5";
        ctx.beginPath();
        ctx.arc(p.x, p.y, (n.type === "project" ? 10 : 3.5) / Math.sqrt(cam.z), 0, Math.PI * 2);
        ctx.fill();
        if (n.id === highlighted) {
          ctx.strokeStyle = "#D4AF67";
          ctx.lineWidth = 1 / cam.z;
          ctx.beginPath();
          ctx.arc(p.x, p.y, (n.type === "project" ? 14 : 7) / Math.sqrt(cam.z), 0, Math.PI * 2);
          ctx.stroke();
        }
      });
      ctx.globalAlpha = 1;
      // Text is measured and placed in screen pixels so zoom never inflates typography.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = "12px 'Times New Roman'";
      const occupied: LabelRect[] = [],
        nodeBoxes: LabelRect[] = [],
        clusterTops = new Map<string, number>();
      visible.forEach((n) => {
        const p = points.current.get(n.id)!;
        const x = p.x * cam.z + w / 2 + cam.x,
          y = p.y * cam.z + h / 2 + cam.y;
        clusterTops.set(n.projectId, Math.min(clusterTops.get(n.projectId) ?? Infinity, y));
        if (x >= 0 && x <= w && y >= 0 && y <= h)
          nodeBoxes.push({ x: x - 7, y: y - 7, w: 14, h: 14 });
      });
      const ordered = [
        ...labelOrder.filter((n) => n.id === highlighted || n.id === selected),
        ...labelOrder.filter((n) => n.id !== highlighted && n.id !== selected),
      ];
      let count = 0;
      const budget = Math.min(60, Math.max(8, Math.floor(((w * h) / 23000) * cam.z)));
      for (const n of ordered) {
        const important = n.id === highlighted || n.id === selected,
          degree = degrees.get(n.id) || 0;
        if (
          !important &&
          (!labels ||
            (highlighted && !relevant(n.id)) ||
            (n.type !== "project" &&
              (count >= budget ||
                cam.z < 0.85 ||
                (cam.z < 1.6 && n.type !== "concept" && degree < 6))))
        )
          continue;
        const p = points.current.get(n.id)!,
          x = p.x * cam.z + w / 2 + cam.x,
          y = p.y * cam.z + h / 2 + cam.y;
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const text = shortLabel(
            n.type === "project" ? n.title.replace(/^DEMO · /, "") : n.title,
            (t) => ctx.measureText(t).width,
            important ? Math.max(60, Math.min(460, w - 28)) : n.type === "project" ? 190 : 142,
          ),
          width = ctx.measureText(text).width;
        const positions = [
          ...(n.type === "project"
            ? [{ x: x - width / 2 - 4, y: (clusterTops.get(n.projectId) ?? y) - 34 }]
            : []),
          { x: x + 10, y: y - 10 },
          { x: x - width - 14, y: y - 10 },
          { x: x - width / 2 - 2, y: y - 29 },
          { x: x - width / 2 - 2, y: y + 12 },
        ];
        const rect = positions
          .map((p) => ({ ...p, w: width + 8, h: 20 }))
          .find(
            (r) =>
              r.x >= 0 &&
              r.y >= 0 &&
              r.x + r.w < w &&
              r.y + r.h < h &&
              !occupied.some((o) => overlaps(r, o)) &&
              !nodeBoxes.some((o) => overlaps(r, o)),
          );
        if (!rect) continue;
        occupied.push(rect);
        count++;
        if (important) {
          ctx.fillStyle = "#191919";
          ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
        }
        ctx.fillStyle = important || n.type === "project" ? "#D4AF67" : "#d0d0d0";
        ctx.fillText(text, rect.x + 4, rect.y + 14);
      }
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("pointerdown", clearOutsideHover, true);
    };
  }, [visible, links, selected, edgeId, labels, labelOrder, degrees, centerGraph]);
  function position(event: { clientX: number; clientY: number }) {
    const r = canvas.current!.getBoundingClientRect(),
      c = camera.current;
    return {
      x: (event.clientX - r.left - size.current.w / 2 - c.x) / c.z,
      y: (event.clientY - r.top - size.current.h / 2 - c.y) / c.z,
    };
  }
  function hit(p: { x: number; y: number }) {
    return visible.find((n) => {
      const q = points.current.get(n.id);
      return q && Math.hypot(p.x - q.x, p.y - q.y) < 10 / camera.current.z;
    });
  }
  function selectAt(p: { x: number; y: number }) {
    const n = hit(p);
    if (n) {
      setSelected(n.id);
      setEdgeId("");
      setDetails(true);
      return;
    }
    const e = links.find((e) => {
      const a = points.current.get(e.sourceNodeId)!,
        b = points.current.get(e.targetNodeId)!;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        t = Math.max(
          0,
          Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
        );
      return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy) < 5 / camera.current.z;
    });
    setEdgeId(e?.id || "");
    setSelected("");
    setDetails(true);
  }
  return (
    <section className="knowledge-view" aria-label="Knowledge Graph">
      <div className="graph-toolbar">
        <div className="graph-modes" role="group" aria-label="Graph scope">
          <button className={mode === "project" ? "active" : ""} onClick={() => setMode("project")}>
            Project Graph
          </button>
          <button className={mode === "brain" ? "active" : ""} onClick={() => setMode("brain")}>
            Second Brain
          </button>
        </div>
        <input
          className="input"
          aria-label="Search graph"
          placeholder="Search knowledge…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="input"
          aria-label="Relationship type"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
        >
          <option value="">All relationships</option>
          {[...new Set(graph.edges.map((e) => e.relationshipType))].map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <label>
          <input
            type="checkbox"
            checked={suggestions}
            onChange={(e) => setSuggestions(e.target.checked)}
          />{" "}
          Suggestions
        </label>
        <button
          className="btn"
          onClick={() => {
            layout.current = createGraphLayout(visible);
            points.current = layout.current.points;
            centerGraph();
            tick.current = 0;
            setFocus("");
          }}
        >
          Reset layout
        </button>
        <button className="btn" disabled={busy} onClick={() => void rebuild(true)}>
          Rebuild Knowledge Graph
        </button>
        {busy && (
          <button className="btn" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
      <p className="graph-status" role="status">
        {visible.length} nodes · {links.length} connections ·{" "}
        {status ||
          (!process.env.NEXT_PUBLIC_RESEARCH_API_BASE
            ? "Explicit relationships. Connect an AI research backend for semantic discovery."
            : "Stored relationships and reviewable semantic suggestions.")}{" "}
        Dashed lines are suggestions; seeded examples are manually authored TEST DATA.
      </p>
      <div className="graph-stage">
        <canvas
          ref={canvas}
          aria-label="Interactive knowledge graph. Drag to pan, scroll to zoom, click nodes or edges to inspect."
          onWheel={(e) => {
            e.preventDefault();
            cameraTarget.current = null;
            const p = position(e);
            const c = camera.current,
              z = Math.max(0.15, Math.min(5, c.z * Math.exp(-e.deltaY * 0.001)));
            c.x += p.x * (c.z - z);
            c.y += p.y * (c.z - z);
            c.z = z;
          }}
          onPointerDown={(e) => {
            cameraTarget.current = null;
            canvas.current!.setPointerCapture(e.pointerId);
            drag.current = { id: hit(position(e))?.id, x: e.clientX, y: e.clientY, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (d) {
              const dx = e.clientX - d.x,
                dy = e.clientY - d.y;
              d.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
              d.x = e.clientX;
              d.y = e.clientY;
              if (d.id) {
                const p = points.current.get(d.id)!;
                const next = position(e),
                  node = visible.find((n) => n.id === d.id);
                if (node?.type === "project" && layout.current) {
                  const dx = next.x - p.x,
                    dy = next.y - p.y;
                  for (const member of visible.filter((n) => n.projectId === node.projectId)) {
                    const point = points.current.get(member.id)!,
                      target = layout.current.targets.get(member.id)!;
                    point.x += dx;
                    point.y += dy;
                    target.x += dx;
                    target.y += dy;
                  }
                  const center = layout.current.centers.get(node.projectId)!;
                  center.x += dx;
                  center.y += dy;
                }
                Object.assign(p, next, { vx: 0, vy: 0 });
                layout.current?.targets.set(d.id, { x: p.x, y: p.y });
                tick.current = 0;
              } else {
                camera.current.x += dx;
                camera.current.y += dy;
              }
            } else {
              const n = hit(position(e));
              hover.current = n?.id || "";
              canvas.current!.title = n?.title || "";
            }
          }}
          onPointerUp={(e) => {
            if (!drag.current?.moved) selectAt(position(e));
            drag.current = null;
            canvas.current!.releasePointerCapture(e.pointerId);
          }}
          onPointerLeave={() => {
            hover.current = "";
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
          onDoubleClick={(e) => {
            const n = hit(position(e));
            if (n) onOpen(n, false);
          }}
        />
        <div className="graph-zoom" role="toolbar" aria-label="Graph view controls">
          <details className="graph-filters">
            <summary>Filters</summary>
            <div>
              <select
                className="input"
                aria-label="Node type"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">All types</option>
                {[...new Set(graph.nodes.map((n) => n.type))].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              {mode === "brain" && (
                <select
                  className="input"
                  aria-label="Focus project and its connections"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                >
                  <option value="">All projects</option>
                  {data.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </details>
          <button
            className="btn"
            onClick={() => {
              centerGraph();
            }}
          >
            Reset View
          </button>
          <button
            className="btn"
            onClick={() => {
              centerGraph();
            }}
          >
            Center Graph
          </button>
          <button className="btn" aria-pressed={labels} onClick={() => setLabels(!labels)}>
            {labels ? "Hide" : "Show"} Labels
          </button>
          <button
            className="btn"
            aria-label="Zoom in"
            onClick={() => {
              cameraTarget.current = null;
              camera.current.z = Math.min(5, camera.current.z * 1.2);
            }}
          >
            +
          </button>
          <button
            className="btn"
            aria-label="Zoom out"
            onClick={() => {
              cameraTarget.current = null;
              camera.current.z = Math.max(0.15, camera.current.z / 1.2);
            }}
          >
            −
          </button>
          {focus && (
            <button className="btn" onClick={() => setFocus("")}>
              Show all
            </button>
          )}
        </div>
        {(current || edge) && (
          <aside className={`graph-details ${details ? "" : "collapsed"}`}>
            <button className="btn" onClick={() => setDetails(!details)}>
              {details ? "Collapse details" : "Show details"}
            </button>
            {details && (
              <>
                {current ? (
                  <>
                    <h2>{current.title}</h2>
                    <p>
                      {current.type} · {data.projects.find((p) => p.id === current.projectId)?.name}
                    </p>
                    <p>{current.summary.slice(0, 1600)}</p>
                    <button className="btn" onClick={() => onOpen(current, false)}>
                      Open in Workspace
                    </button>
                    <button className="btn" onClick={() => onOpen(current, true)}>
                      Open in other panel
                    </button>
                    <button className="btn" onClick={() => setFocus(current.id)}>
                      Focus neighbors
                    </button>
                    <h3>Connected items</h3>
                    {edges
                      .filter((e) => e.sourceNodeId === current.id || e.targetNodeId === current.id)
                      .map((e) => (
                        <button
                          className="graph-connection"
                          key={e.id}
                          onClick={() => {
                            setSelected("");
                            setEdgeId(e.id);
                          }}
                        >
                          {
                            graph.nodes.find(
                              (n) =>
                                n.id ===
                                (e.sourceNodeId === current.id ? e.targetNodeId : e.sourceNodeId),
                            )?.title
                          }{" "}
                          · {e.relationshipType}
                        </button>
                      ))}
                  </>
                ) : (
                  edge && (
                    <>
                      <h2>{edge.relationshipType}</h2>
                      <p>{edge.explanation}</p>
                      <p>
                        {edge.origin === "seeded"
                          ? "TEST DATA · manually seeded example (no AI analysis)"
                          : edge.origin === "inferred"
                            ? "AI-inferred suggestion"
                            : "Stored relationship"}{" "}
                        · {edge.reviewStatus}
                      </p>
                      {edge.confidence !== undefined && (
                        <p>Confidence: {Math.round(edge.confidence * 100)}% (provider estimate)</p>
                      )}
                      {edge.origin === "inferred" && (
                        <>
                          <button className="btn" onClick={() => review(edge.id, "confirmed")}>
                            Confirm connection
                          </button>
                          <button className="btn" onClick={() => review(edge.id, "rejected")}>
                            Reject connection
                          </button>
                        </>
                      )}
                      <button className="btn" onClick={() => review(edge.id, "hidden")}>
                        Hide connection
                      </button>
                    </>
                  )
                )}
                <h3>Source references</h3>
                {(current?.references || edge?.evidenceReferences || []).map((r, i) => (
                  <button
                    className="graph-connection"
                    key={i}
                    onClick={() => {
                      const n = graph.nodes.find(
                        (n) => n.type === "document" && n.sourceId === r.documentId,
                      );
                      if (n) onOpen(n, true);
                    }}
                  >
                    {data.documents.find((d) => d.id === r.documentId)?.title}
                    {r.page ? ` · p. ${r.page}` : ""}
                    {r.quote ? ` · “${r.quote}”` : ""}
                  </button>
                ))}
              </>
            )}
          </aside>
        )}
      </div>
      <details className="graph-accessible">
        <summary>Browse nodes</summary>
        {visible.map((n) => (
          <button
            className="graph-connection"
            key={n.id}
            onClick={() => {
              setSelected(n.id);
              setEdgeId("");
              setDetails(true);
            }}
          >
            {n.title}
          </button>
        ))}
      </details>
      {process.env.NODE_ENV === "development" && (
        <details className="dev-controls">
          <summary>Development Test Data</summary>
          <span>Fictional DEMO records · removable · no verified citations.</span>
          {process.env.NEXT_PUBLIC_RESEARCH_API_BASE && (
            <label>
              <input
                type="checkbox"
                checked={analyzeDemo}
                onChange={(e) => setAnalyzeDemo(e.target.checked)}
              />{" "}
              Include test data in real AI discovery
            </label>
          )}
          <button
            className="btn"
            disabled={!service.manageTestData}
            onClick={() => {
              try {
                service.manageTestData?.(true);
                setNotice("DEMO dataset loaded.");
              } catch (e) {
                setNotice(String(e));
              }
            }}
          >
            Load Test Data
          </button>
          <button
            className="btn"
            disabled={!service.manageTestData}
            onClick={() => {
              try {
                service.manageTestData?.(false);
                setSelected("");
                setEdgeId("");
                setNotice("Generated DEMO records cleared.");
              } catch (e) {
                setNotice(String(e));
              }
            }}
          >
            Clear Test Data
          </button>
          <button
            className="btn"
            disabled={busy}
            onClick={() => {
              tick.current = 0;
              void rebuild(false);
            }}
          >
            Regenerate Knowledge Graph
          </button>
        </details>
      )}
    </section>
  );
}
