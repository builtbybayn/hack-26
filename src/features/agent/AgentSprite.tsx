"use client";

/**
 * PLACEHOLDER for the assistant sprite: a fluid blob drifting in zero G whose motion and color
 * follow the agent state. Swap the blob for the real sprite and keep the `data-state` mapping;
 * every state is listed in `AGENT_STATES` (src/lib/agent-activity.ts).
 */
import { AGENT_STATES, useAgentActivity } from "@/lib/agent-activity";
import "./agent-sprite.css";

export function AgentSprite({ greeting }: { greeting?: string }) {
  const snapshot = useAgentActivity();
  const info = AGENT_STATES[snapshot.state];
  const idle = snapshot.state === "idle";
  return (
    <div className="agent-sprite" data-state={snapshot.state} role="status" aria-live="polite">
      <div className="agent-sprite-stage" aria-hidden>
        <div className="agent-sprite-blob" />
        <div className="agent-sprite-shadow" />
      </div>
      <p className="agent-sprite-label">{idle && greeting ? greeting : info.label}</p>
      {!idle && snapshot.detail && <p className="agent-sprite-detail">{snapshot.detail}</p>}
    </div>
  );
}
