"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWorkspace } from "./workspace-context";
import {
  buildKnowledgeGraph,
  discoveryChunks,
  discoverRelationships,
  type KnowledgeEdge,
} from "./knowledge-graph";
import { DEMO_PREFIX } from "./dev-seed";
import { trackAI } from "./ai-activity";
import { getWorkspaceState, putWorkspaceState } from "@/lib/browser-store";
type Review = KnowledgeEdge["reviewStatus"];
const Context = createContext<ReturnType<typeof useKnowledgeState> | null>(null);
function useKnowledgeState() {
  const { data } = useWorkspace();
  const graph = useMemo(() => buildKnowledgeGraph(data), [data]);
  const [analyzeDemo, setAnalyzeDemo] = useState(false);
  const discoveryGraph = useMemo(
    () =>
      analyzeDemo
        ? graph
        : {
            nodes: graph.nodes.filter((n) => !n.sourceId.startsWith(DEMO_PREFIX)),
            edges: graph.edges.filter(
              (e) => !e.sourceNodeId.includes(DEMO_PREFIX) && !e.targetNodeId.includes(DEMO_PREFIX),
            ),
          },
    [graph, analyzeDemo],
  );
  const chunks = useMemo(
    () =>
      discoveryChunks(data, graph).filter((c) => analyzeDemo || !c.nodeId.includes(DEMO_PREFIX)),
    [data, graph, analyzeDemo],
  );
  const [inferred, setInferred] = useState<KnowledgeEdge[]>([]),
    [reviews, setReviews] = useState<Record<string, Review>>({}),
    [ready, setReady] = useState(false),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  const processed = useRef(new Set<string>()),
    controller = useRef<AbortController | null>(null),
    running = useRef(false),
    generation = useRef(0);
  useEffect(() => {
    let active = true;
    void getWorkspaceState<{
      edges: KnowledgeEdge[];
      reviews: Record<string, Review>;
      processed: string[];
    }>("knowledge-graph")
      .then((saved) => {
        if (!active) return;
        setInferred(saved?.edges || []);
        setReviews(saved?.reviews || {});
        processed.current = new Set(saved?.processed || []);
        setReady(true);
      })
      .catch(() => {
        if (active) setStatus("Graph review decisions could not be loaded.");
      });
    return () => {
      active = false;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (ready)
      void putWorkspaceState(
        { edges: inferred, reviews, processed: [...processed.current] },
        "knowledge-graph",
      ).catch(() => setStatus("Graph decisions could not be saved: browser storage is full."));
  }, [ready, inferred, reviews]);
  const rebuild = useCallback(
    async (force = false) => {
      if (!process.env.NEXT_PUBLIC_RESEARCH_API_BASE) {
        setStatus(
          "Explicit graph rebuilt from current research. Semantic discovery requires a configured research backend.",
        );
        return;
      }
      if (running.current) {
        if (!force) return;
        controller.current?.abort();
      }
      const run = ++generation.current;
      const abort = new AbortController();
      controller.current = abort;
      running.current = true;
      setBusy(true);
      if (force) processed.current.clear();
      const live = new Set(chunks.map((c) => c.fingerprint));
      const removed = [...processed.current].filter((f) => !live.has(f));
      const changed = chunks.filter((c) => !processed.current.has(c.fingerprint));
      try {
        await trackAI(async () => {
          const collected: KnowledgeEdge[] = [];
          for (let i = 0; i < changed.length; i += 24) {
            setStatus(
              `Analyzing passages ${i + 1}–${Math.min(i + 24, changed.length)} of ${changed.length}`,
            );
            const batch = changed.slice(i, i + 24);
            const edges = await discoverRelationships(batch, discoveryGraph, abort.signal, chunks);
            if (abort.signal.aborted) return;
            collected.push(...edges);
          }
          if (abort.signal.aborted) return;
          changed.forEach((c) => processed.current.add(c.fingerprint));
          processed.current = new Set(
            chunks.map((c) => c.fingerprint).filter((f) => processed.current.has(f)),
          );
          setInferred((old) => {
            const touched = new Set([
              ...changed.map((c) => c.nodeId),
              ...removed.map((f) => f.split(":").slice(0, -2).join(":")),
            ]);
            const merged = new Map(
              (force
                ? []
                : old.filter((e) => !touched.has(e.sourceNodeId) && !touched.has(e.targetNodeId))
              ).map((e) => [e.id, e]),
            );
            collected.forEach((e) => merged.set(e.id, e));
            return [...merged.values()];
          });
          setStatus(changed.length ? "Semantic suggestions updated." : "Graph is up to date.");
        });
      } catch (e) {
        if (!abort.signal.aborted) setStatus(e instanceof Error ? e.message : "Discovery failed.");
      } finally {
        if (generation.current === run) {
          running.current = false;
          setBusy(false);
        }
      }
    },
    [chunks, discoveryGraph],
  );
  const attempted = useRef("");
  const signature = chunks.map((c) => c.fingerprint).join("|");
  useEffect(() => {
    if (!ready || !process.env.NEXT_PUBLIC_RESEARCH_API_BASE) return;
    if (running.current || attempted.current === signature) return;
    const timer = setTimeout(() => {
      attempted.current = signature;
      void rebuild();
    }, 1200);
    return () => clearTimeout(timer);
  }, [signature, ready, busy, rebuild]);
  const ids = new Set(graph.nodes.map((n) => n.id));
  return {
    graph: {
      nodes: graph.nodes,
      edges: [
        ...graph.edges,
        ...inferred.filter((e) => ids.has(e.sourceNodeId) && ids.has(e.targetNodeId)),
      ].map((e) => ({ ...e, reviewStatus: reviews[e.id] || e.reviewStatus })),
    },
    busy,
    status,
    rebuild,
    analyzeDemo,
    setAnalyzeDemo,
    review: (id: string, value: Review) => setReviews((old) => ({ ...old, [id]: value })),
    cancel: () => controller.current?.abort(),
  };
}
export function KnowledgeProvider({ children }: { children: ReactNode }) {
  const value = useKnowledgeState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useKnowledge() {
  const value = useContext(Context);
  if (!value) throw new Error("KnowledgeProvider missing");
  return value;
}
