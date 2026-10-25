"use client";

import { AGENT_STATES, useAgentActivity } from "@/lib/agent-activity";
import { FluidMatter } from "./FluidMatter";
import "./agent-sprite.css";

export function AgentSprite({ greeting }: { greeting?: string }) {
  const snapshot = useAgentActivity();
  const info = AGENT_STATES[snapshot.state];
  const idle = snapshot.state === "idle";
  return (
    <div className="agent-sprite" data-state={snapshot.state} role="status" aria-live="polite">
      <div className="agent-sprite-stage" aria-hidden>
        <FluidMatter state={snapshot.state} />
      </div>
      <p className="agent-sprite-label">{idle && greeting ? greeting : info.label}</p>
      {!idle && snapshot.detail && <p className="agent-sprite-detail">{snapshot.detail}</p>}
    </div>
  );
}
