"use client";

import { useSyncExternalStore } from "react";
import { getAgentSnapshot, subscribeAgentActivity, track } from "@/lib/agent-activity";

/** The new shell shares the same activity source as API clients, voice, and the extension. */
export function getAIActivity(): "idle" | "researching" | "error" {
  const { state } = getAgentSnapshot();
  return state === "idle" || state === "error" ? state : "researching";
}
export function trackAI<T>(operation: () => Promise<T>): Promise<T> {
  return track("thinking", null, operation);
}
export function useAIActivity() {
  return useSyncExternalStore(subscribeAgentActivity, getAIActivity, () => "idle" as const);
}
