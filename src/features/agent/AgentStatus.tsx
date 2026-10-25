"use client";

import { AGENT_STATES, useAgentActivity } from "@/lib/agent-activity";
import { FluidMatter } from "./FluidMatter";
import "./agent-status.css";

export function AgentStatus({ variant = "inline" }: { variant?: "inline" | "floating" }) {
  const snapshot = useAgentActivity();
  const info = AGENT_STATES[snapshot.state];
  return (
    <div
      className={`agent-status agent-status-${variant}`}
      data-state={snapshot.state}
      role="status"
      aria-live="polite"
      title={info.meaning}
    >
      <span className="agent-status-matter" aria-hidden>
        <FluidMatter state={snapshot.state} />
      </span>
      <span className="agent-label">
        <strong>{info.label}</strong>
        {snapshot.detail && snapshot.state !== "idle" && <small>{snapshot.detail}</small>}
      </span>
    </div>
  );
}
