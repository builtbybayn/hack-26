"use client";

/**
 * PLACEHOLDER for the assistant sprite. Shows the current agent state as a dot and a label.
 * To add the sprite, render it here and pick its animation from `snapshot.state`; every state
 * is listed in `AGENT_STATES` (src/lib/agent-activity.ts).
 */
import { AGENT_STATES, useAgentActivity } from "@/lib/agent-activity";
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
      <span className="agent-orb" aria-hidden />
      <span className="agent-label">
        <strong>{info.label}</strong>
        {snapshot.detail && snapshot.state !== "idle" && <small>{snapshot.detail}</small>}
      </span>
    </div>
  );
}
