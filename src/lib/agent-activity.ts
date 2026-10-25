/**
 * What the assistant is doing right now. This drives the animated sprite (and any status UI):
 * map each `AgentState` to an animation and subscribe with `useAgentActivity()`.
 *
 * API clients report their work here (see `track`), so new features get states automatically.
 * Browser-only state, one per page: the web app and the extension panel each have their own.
 * Non-React code can listen for the `knowbefore:agent` window event instead.
 */
import { useSyncExternalStore } from "react";

export type AgentState =
  | "idle"
  | "reading"
  | "analyzing"
  | "searching"
  | "comparing"
  | "thinking"
  | "preparing-voice"
  | "speaking"
  | "error";

/** Labels for UI and the order in which simultaneous activities win (highest priority shows). */
export const AGENT_STATES: Record<
  AgentState,
  { label: string; meaning: string; priority: number }
> = {
  error: { label: "Something went wrong", meaning: "The last action failed.", priority: 100 },
  speaking: { label: "Speaking", meaning: "Reading text aloud.", priority: 90 },
  thinking: { label: "Thinking", meaning: "Explaining or answering with AI.", priority: 80 },
  analyzing: {
    label: "Analyzing",
    meaning: "Finding the paper's concepts and prerequisites.",
    priority: 70,
  },
  comparing: {
    label: "Comparing",
    meaning: "Checking claims against other papers for contradictions.",
    priority: 60,
  },
  searching: { label: "Searching", meaning: "Looking for related papers.", priority: 50 },
  reading: { label: "Reading", meaning: "Extracting text from the paper.", priority: 40 },
  "preparing-voice": {
    label: "Preparing voice",
    meaning: "Generating speech audio.",
    priority: 30,
  },
  idle: { label: "Idle", meaning: "Waiting for something to do.", priority: 0 },
};

export type BusyState = Exclude<AgentState, "idle" | "error">;

export interface AgentActivity {
  id: number;
  state: BusyState;
  detail: string | null;
}

export interface AgentSnapshot {
  /** The state to show: the highest-priority current activity, a recent error, or idle. */
  state: AgentState;
  /** Human-readable detail for the shown state, e.g. "Reading attention.pdf". */
  detail: string | null;
  /** Everything currently running. */
  activities: AgentActivity[];
}

/** How long an error stays visible unless new work starts first. */
const ERROR_VISIBLE_MS = 6_000;
/** Back-to-back steps (read → analyze) shouldn't flash idle in between. */
export const IDLE_GRACE_MS = 400;
const IDLE: AgentSnapshot = { state: "idle", detail: null, activities: [] };

const activities = new Map<number, AgentActivity>();
const listeners = new Set<() => void>();
let nextId = 1;
let error: { message: string; timer: ReturnType<typeof setTimeout> } | null = null;
let snapshot: AgentSnapshot = IDLE;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function publish() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const running = [...activities.values()];
  const top = running.reduce<AgentActivity | null>(
    (best, activity) =>
      !best || AGENT_STATES[activity.state].priority > AGENT_STATES[best.state].priority
        ? activity
        : best,
    null,
  );
  const next: AgentSnapshot = error
    ? { state: "error", detail: error.message, activities: running }
    : top
      ? { state: top.state, detail: top.detail, activities: running }
      : IDLE;
  if (next === IDLE && snapshot !== IDLE) {
    // Wait briefly: if more work starts, the idle state is never shown.
    idleTimer = setTimeout(() => emit(IDLE), IDLE_GRACE_MS);
    return;
  }
  emit(next);
}

function emit(next: AgentSnapshot) {
  idleTimer = null;
  snapshot = next;
  for (const listener of listeners) listener();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("knowbefore:agent", { detail: snapshot }));
  }
}

function clearError() {
  if (!error) return;
  clearTimeout(error.timer);
  error = null;
}

/** Marks work as started. Call the returned function when it ends (safe to call twice). */
export function beginActivity(state: BusyState, detail: string | null = null): () => void {
  clearError();
  const id = nextId++;
  activities.set(id, { id, state, detail });
  publish();
  return () => {
    if (activities.delete(id)) publish();
  };
}

/** Shows the error state briefly; new work replaces it sooner. */
export function reportAgentError(message: string): void {
  clearError();
  error = {
    message,
    timer: setTimeout(() => {
      error = null;
      publish();
    }, ERROR_VISIBLE_MS),
  };
  publish();
}

/**
 * Runs `work` under a state. API results of the form `{ ok: false, error }` and thrown errors
 * (except cancellations) are reported as the error state; the result is returned unchanged.
 */
export async function track<T>(
  state: BusyState,
  detail: string | null,
  work: () => Promise<T>,
): Promise<T> {
  const end = beginActivity(state, detail);
  try {
    const result = await work();
    end();
    const failed = result as { ok?: boolean; error?: { message?: string } } | null;
    if (failed && typeof failed === "object" && failed.ok === false) {
      reportAgentError(failed.error?.message ?? "Something went wrong.");
    }
    return result;
  } catch (caught) {
    end();
    if (!(caught instanceof DOMException && caught.name === "AbortError")) {
      reportAgentError(caught instanceof Error ? caught.message : "Something went wrong.");
    }
    throw caught;
  }
}

export function getAgentSnapshot(): AgentSnapshot {
  return snapshot;
}

export function subscribeAgentActivity(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAgentActivity(): AgentSnapshot {
  return useSyncExternalStore(subscribeAgentActivity, getAgentSnapshot, () => IDLE);
}
