import type { WorkspaceData } from "./models";
export const DEMO_PREFIX = "demo-research-v1-";
const date = "2026-01-01T00:00:00.000Z";
const topics = [
  [
    "Artificial Intelligence and Cybersecurity",
    "Adversarial detection",
    "Model poisoning",
    "Security telemetry",
  ],
  [
    "Zero Trust Architecture",
    "Continuous authentication",
    "Identity boundaries",
    "Policy enforcement",
  ],
  ["Enterprise AI Adoption", "Workflow integration", "Human oversight", "Model evaluation"],
  [
    "Quantum Computing and Cryptography",
    "Post-quantum migration",
    "Crypto agility",
    "Key lifecycle",
  ],
  ["Human-Computer Interaction", "Trust calibration", "Cognitive load", "Accessible explanations"],
  [
    "Renewable Energy Technologies",
    "Grid forecasting",
    "Storage dispatch",
    "Infrastructure resilience",
  ],
  [
    "Space Systems and Satellite Security",
    "Command authentication",
    "Ground station security",
    "Telemetry integrity",
  ],
  [
    "Digital Forensics and Incident Response",
    "Evidence provenance",
    "Incident triage",
    "Recovery validation",
  ],
  ["Technology Risk and Governance", "Accountability", "Risk assessment", "Audit evidence"],
  [
    "Machine Learning and Predictive Analytics",
    "Distribution shift",
    "Forecast calibration",
    "Monitoring drift",
  ],
];
export const demoId = (project: number, kind = "project", index = 0) =>
  `${DEMO_PREFIX}${project}-${kind}-${index}`;
export function loadDemo(data: WorkspaceData): WorkspaceData {
  const next = structuredClone(data);
  topics.forEach(([name, ...concepts], p) => {
    const projectId = demoId(p),
      location = (i: number) => ({ documentId: demoId(p, "document", i % 6), page: 1 });
    if (next.projects.some((x) => x.id === projectId)) return;
    next.projects.push({
      id: projectId,
      name: `DEMO · ${name}`,
      description:
        "TEST DATA: fictional research workspace. No published research or verified citations are represented.",
      updatedAt: date,
    });
    for (let i = 0; i < 6; i++) {
      const topic = concepts[i % 3],
        title = `DEMO · ${topic}: ${i < 3 ? "deployment study" : "evaluation protocol"} in ${name}`;
      const summary = `TEST DATA — fictional scenario. The team evaluates ${topic.toLowerCase()} using a baseline, a controlled deployment, and a failure recovery exercise. Compare false positives, operator effort, and evidence quality before recommending wider adoption.`;
      next.documents.push({
        id: demoId(p, "document", i),
        projectId,
        title,
        kind: "article",
        authors: [],
        tags: ["DEMO", "TEST DATA", topic],
        status: "ready",
        reading: "unread",
        addedAt: date,
        summary,
        passages: [
          { id: demoId(p, "passage", i), page: 1, heading: "Fictional evaluation", text: summary },
        ],
        demo: true,
      });
    }
    concepts.forEach((name, i) =>
      next.concepts.push({
        id: demoId(p, "concept", i),
        projectId,
        name: `DEMO · ${name}`,
        why: `TEST DATA: ${name} affects deployment reliability and review quality.`,
        refresher: "Fictional learning prompt: compare the baseline and failure scenario.",
        requires: i ? [demoId(p, "concept", i - 1)] : [],
        location: location(i),
        status: "to-learn",
        origin: "needs-review",
        order: i,
      }),
    );
    for (let i = 0; i < 2; i++) {
      next.claims.push({
        id: demoId(p, "claim", i),
        projectId,
        text: `DEMO · ${concepts[i]} requires independent validation before deployment.`,
        location: location(i),
        assumptions: [],
      });
      next.findings.push({
        id: demoId(p, "finding", i),
        projectId,
        claimId: demoId(p, "claim", i),
        type: i ? "different-conditions" : "supporting",
        related: [location(i), location(i + 3)],
        explanation: `TEST DATA: the fictional ${concepts[i]} pilot suggests improved reliability under controlled conditions.`,
        uncertainty: "Fictional example; no empirical results or AI analysis occurred.",
        review: "needs-review",
        saved: false,
      });
    }
    for (let i = 0; i < 6; i++)
      next.notes.push({
        id: demoId(p, "note", i),
        projectId,
        title: `DEMO · ${concepts[i % 3]} — ${["baseline", "failure modes", "operator review", "measurement plan", "deployment tradeoffs", "open questions"][i]}`,
        body: `TEST DATA: examine ${concepts[i % 3].toLowerCase()} in ${name}. Compare the linked fictional study with the evaluation protocol. Record error rates, review time, and recovery assumptions. The recommendation remains provisional until independently validated.`,
        location: location(i),
        conceptId: demoId(p, "concept", i % 3),
        findingId: demoId(p, "finding", i % 2),
        question: i === 5,
        resolved: false,
        updatedAt: date,
      });
  });
  return next;
}
export function clearDemo(data: WorkspaceData): WorkspaceData {
  const next = structuredClone(data);
  for (const key of [
    "projects",
    "documents",
    "notes",
    "concepts",
    "claims",
    "findings",
    "annotations",
  ] as const)
    next[key] = next[key].filter((x) => !x.id.startsWith(DEMO_PREFIX)) as never;
  for (const key of Object.keys(next.drafts))
    if (key.startsWith(DEMO_PREFIX)) delete next.drafts[key];
  for (const key of Object.keys(next.conversations))
    if (key.startsWith(DEMO_PREFIX)) delete next.conversations[key];
  if (next.activeProjectId.startsWith(DEMO_PREFIX)) {
    next.activeProjectId = next.projects[0].id;
    next.draft = next.drafts[next.activeProjectId] || {
      id: "local-draft",
      projectId: next.activeProjectId,
      title: "",
      authors: "",
      abstract: "",
      body: "",
      citations: [],
      updatedAt: date,
      style: "APA 7",
    };
    next.conversation = next.conversations[next.activeProjectId] || {
      id: "local",
      projectId: next.activeProjectId,
      messages: [],
    };
  }
  return next;
}
export const demoConnections = [
  [0, 1, "Detection signals can inform continuous access evaluation."],
  [2, 8, "AI rollout needs accountable owners and auditable risk decisions."],
  [3, 1, "Post-quantum key migration changes identity trust boundaries."],
  [6, 0, "Satellite command and telemetry require attack detection."],
  [7, 0, "Detection telemetry supports incident reconstruction and response."],
  [9, 2, "Prediction models need enterprise evaluation and monitoring."],
  [4, 2, "Trust calibration and cognitive load affect adoption."],
  [5, 8, "Energy infrastructure resilience requires technology risk oversight."],
  [5, 9, "Grid forecasting shares drift and calibration concerns."],
] as const;
