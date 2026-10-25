import type { WorkspaceData } from "./models";
export const DEMO_PREFIX = "demo-research-v1-";
const date = "2026-01-01T00:00:00.000Z";
// Authored scenarios, not fabricated academic citations. Six source questions per field.
const topics = [
  [
    "Artificial Intelligence and Cybersecurity",
    "Adversarial inputs",
    "Model poisoning",
    "Prompt injection",
    "Threat detection",
    "AI governance",
    "Security telemetry",
  ],
  [
    "Zero Trust Architecture",
    "Continuous authentication",
    "Identity boundaries",
    "Policy enforcement",
    "Device posture",
    "Service identities",
    "Access revocation",
  ],
  [
    "Enterprise AI Adoption",
    "Workflow integration",
    "Human oversight",
    "Model evaluation",
    "Data readiness",
    "Procurement controls",
    "Adoption measurement",
  ],
  [
    "Quantum Computing and Cryptography",
    "Post-quantum migration",
    "Crypto agility",
    "Key lifecycle",
    "Harvest-now attacks",
    "Hybrid key exchange",
    "Protocol inventory",
  ],
  [
    "Human-Computer Interaction",
    "Trust calibration",
    "Cognitive load",
    "Accessible explanations",
    "Error recovery",
    "Automation bias",
    "Usability evaluation",
  ],
  [
    "Renewable Energy Technologies",
    "Grid forecasting",
    "Storage dispatch",
    "Infrastructure resilience",
    "Inverter controls",
    "Demand response",
    "Lifecycle emissions",
  ],
  [
    "Space Systems and Satellite Security",
    "Command authentication",
    "Ground station security",
    "Telemetry integrity",
    "Orbital update windows",
    "Supply chain assurance",
    "Link availability",
  ],
  [
    "Digital Forensics and Incident Response",
    "Evidence provenance",
    "Incident triage",
    "Recovery validation",
    "Memory acquisition",
    "Timeline reconstruction",
    "Cloud log retention",
  ],
  [
    "Technology Risk and Governance",
    "Accountability",
    "Risk assessment",
    "Audit evidence",
    "Third-party exposure",
    "Exception management",
    "Control effectiveness",
  ],
  [
    "Machine Learning and Predictive Analytics",
    "Distribution shift",
    "Forecast calibration",
    "Monitoring drift",
    "Feature leakage",
    "Uncertainty estimation",
    "Model retraining",
  ],
];
const questions = [
  [
    "How do adversarial inputs evade a telemetry classifier?",
    "Which data controls expose poisoning before training?",
    "Can retrieved instructions override an analyst assistant?",
    "When does ML detection outperform a rules baseline?",
    "Who approves high-impact automated security actions?",
    "What telemetry is lost during a collector outage?",
  ],
  [
    "When should a session be challenged again?",
    "Where should privileged identity boundaries sit?",
    "How does policy propagation delay affect access?",
    "Can stale device posture permit unsafe access?",
    "How should short-lived service credentials rotate?",
    "How quickly can a compromised session be revoked?",
  ],
  [
    "Which tasks benefit from assisted drafting?",
    "When must an employee review model output?",
    "What evaluation blocks an unsafe rollout?",
    "Which data gaps undermine a pilot?",
    "How should buyers assess vendor model changes?",
    "Does tool usage predict better business outcomes?",
  ],
  [
    "Which systems need migration first?",
    "How can algorithms change without replacing applications?",
    "What key retention periods matter most?",
    "Which archived secrets face future decryption?",
    "What latency does hybrid exchange introduce?",
    "Where are cryptographic dependencies undocumented?",
  ],
  [
    "Do confidence cues encourage appropriate reliance?",
    "How many alerts can an operator evaluate?",
    "Can keyboard users inspect an explanation?",
    "How should users recover from an automated mistake?",
    "When do users accept an incorrect recommendation?",
    "Which task measures reveal interface friction?",
  ],
  [
    "How does weather shift affect solar forecasts?",
    "When should a battery reserve capacity?",
    "Can a microgrid recover after communication loss?",
    "How do inverter settings affect grid stability?",
    "Which demand incentives move peak consumption?",
    "How does storage replacement affect lifecycle impact?",
  ],
  [
    "Can replayed commands reach a satellite?",
    "How should a ground station isolate tenant traffic?",
    "Which checks reveal corrupted telemetry?",
    "How do short contact windows constrain patching?",
    "How can integrators verify component provenance?",
    "What operations survive a disrupted downlink?",
  ],
  [
    "How is custody preserved across evidence transfers?",
    "Which signals justify incident escalation?",
    "What proves an endpoint is safe to restore?",
    "Which volatile artifacts disappear on reboot?",
    "How should investigators reconcile clock skew?",
    "What retention covers a delayed cloud investigation?",
  ],
  [
    "Who owns residual risk after approval?",
    "How should teams compare likelihood estimates?",
    "What evidence demonstrates a control operated?",
    "How does vendor concentration change exposure?",
    "When should a temporary exception expire?",
    "Do control metrics predict reduced incidents?",
  ],
  [
    "Which shifts invalidate a deployed classifier?",
    "Do predicted probabilities match observed outcomes?",
    "Which drift alarms deserve investigation?",
    "Can future information leak into training features?",
    "How should prediction intervals guide decisions?",
    "When is retraining safer than recalibration?",
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
      description: `TEST DATA — fictional demonstration project investigating ${name.toLowerCase()}. Compare ${concepts[0].toLowerCase()}, ${concepts[1].toLowerCase()}, and ${concepts[2].toLowerCase()} through baseline measurements, failure exercises, and deployment decisions. No published research or verified citations are represented.`,
      updatedAt: date,
    });
    for (let i = 0; i < 6; i++) {
      const topic = concepts[i],
        title = `DEMO · ${topic}: ${questions[p][i]}`;
      const summary = `TEST DATA — fictional demonstration source, authored for interface testing; not a published paper. Research question: ${questions[p][i]} The proposed exercise compares ${topic.toLowerCase()} under routine operation and a deliberately degraded condition. Keep the workload fixed, record missed failures and review time, and document data retention and operator assumptions. This is an evaluation plan, not an empirical result. Decision: defer deployment if the degraded condition cannot be detected or safely recovered. Cross-check ${concepts[(i + 1) % 6].toLowerCase()} before accepting the recommendation.`;
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
    for (let i = 0; i < 3; i++) {
      next.claims.push({
        id: demoId(p, "claim", i),
        projectId,
        text: `DEMO · ${concepts[i]} requires independent validation before deployment.`,
        location: location(i),
        assumptions: [
          {
            id: demoId(p, "assumption", i),
            text: `TEST DATA: the evaluation workload represents real ${concepts[i].toLowerCase()} failures.`,
            location: location(i),
          },
        ],
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
    for (let i = 0; i < 7; i++)
      next.notes.push({
        id: demoId(p, "note", i),
        projectId,
        title:
          i === 6
            ? "DEMO · Roadmap"
            : `DEMO · ${concepts[i % 6]} — ${["baseline", "failure modes", "operator review", "measurement plan", "deployment tradeoffs", "open questions", "Roadmap"][i]}`,
        body: `# ${i === 6 ? "Research roadmap" : concepts[i % 6]}\n\nTEST DATA — authored demonstration note.\n\n> Investigate ${name.toLowerCase()} through baseline measurements, failure exercises, and reviewed deployment decisions. Fictional development project.\n\n${questions[p][i % 6]}\n\n## Investigation\nCompare the linked fictional source with the ${concepts[(i + 1) % 6].toLowerCase()} scenario. Separate measured observations from operator judgement.\n\n## Next steps\n- [ ] Establish a baseline and define failure criteria.\n- [ ] Run a degraded-condition exercise.\n- [ ] Review ${concepts[(i + 2) % 6].toLowerCase()} dependencies.\n- [ ] Record uncertainty before making a deployment decision.\n\nNo empirical result or academic citation is asserted.`,
        location: location(i),
        conceptId: demoId(p, "concept", i % 6),
        findingId: demoId(p, "finding", i % 3),
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
    next.activeProjectId = next.projects[0]?.id || "loading";
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
  [0, 9, "Security detection classifiers need shift monitoring and calibration."],
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
