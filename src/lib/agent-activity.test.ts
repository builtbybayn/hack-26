import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginActivity,
  getAgentSnapshot,
  IDLE_GRACE_MS,
  ERROR_VISIBLE_MS,
  reportAgentError,
  track,
} from "./agent-activity";

afterEach(() => {
  vi.useRealTimers();
});

describe("agent activity", () => {
  it("is idle with nothing running", () => {
    expect(getAgentSnapshot()).toEqual({ state: "idle", detail: null, activities: [] });
  });

  it("shows the highest-priority activity and falls back as work ends", () => {
    vi.useFakeTimers();
    const endReading = beginActivity("reading", "Reading paper.pdf");
    const endAnalyzing = beginActivity("analyzing", "Analyzing paper");
    expect(getAgentSnapshot()).toMatchObject({ state: "analyzing", detail: "Analyzing paper" });
    expect(getAgentSnapshot().activities).toHaveLength(2);

    endAnalyzing();
    expect(getAgentSnapshot().state).toBe("reading");
    endReading();
    endReading(); // ending twice is harmless
    expect(getAgentSnapshot().state).toBe("reading"); // idle waits for the grace period
    vi.advanceTimersByTime(IDLE_GRACE_MS);
    expect(getAgentSnapshot().state).toBe("idle");
  });

  it("does not flash idle between back-to-back steps", () => {
    vi.useFakeTimers();
    const states: string[] = [];
    const endReading = beginActivity("reading");
    states.push(getAgentSnapshot().state);
    endReading();
    const endAnalyzing = beginActivity("analyzing");
    states.push(getAgentSnapshot().state);
    endAnalyzing();
    vi.advanceTimersByTime(IDLE_GRACE_MS);
    states.push(getAgentSnapshot().state);
    expect(states).toEqual(["reading", "analyzing", "idle"]);
  });

  it("reports failed API results as a temporary error state", async () => {
    vi.useFakeTimers();
    const result = await track("searching", null, async () => ({
      ok: false as const,
      error: { message: "Provider down" },
    }));
    expect(result.ok).toBe(false);
    expect(getAgentSnapshot()).toMatchObject({ state: "error", detail: "Provider down" });

    vi.advanceTimersByTime(ERROR_VISIBLE_MS);
    expect(getAgentSnapshot().state).toBe("idle");
  });

  it("clears an error as soon as new work starts", () => {
    vi.useFakeTimers();
    reportAgentError("Failed");
    const end = beginActivity("thinking");
    expect(getAgentSnapshot().state).toBe("thinking");
    end();
    vi.advanceTimersByTime(IDLE_GRACE_MS);
  });

  it("expires exactly at four seconds and restores ongoing work", () => {
    vi.useFakeTimers();
    expect(ERROR_VISIBLE_MS).toBe(4_000);
    const end = beginActivity("analyzing");
    reportAgentError("Another operation failed");
    vi.advanceTimersByTime(ERROR_VISIBLE_MS - 1);
    expect(getAgentSnapshot().state).toBe("error");
    vi.advanceTimersByTime(1);
    expect(getAgentSnapshot().state).toBe("analyzing");
    end();
    vi.advanceTimersByTime(IDLE_GRACE_MS);
  });

  it("replaces error timers and cannot interrupt a newer request", () => {
    vi.useFakeTimers();
    reportAgentError("First failure");
    vi.advanceTimersByTime(2_000);
    reportAgentError("Second failure");
    vi.advanceTimersByTime(2_000);
    expect(getAgentSnapshot().detail).toBe("Second failure");
    const end = beginActivity("thinking", "New request");
    vi.advanceTimersByTime(ERROR_VISIBLE_MS);
    expect(getAgentSnapshot()).toMatchObject({ state: "thinking", detail: "New request" });
    end();
    vi.advanceTimersByTime(IDLE_GRACE_MS);
  });

  it("allows preview cleanup without cancelling a newer failure", () => {
    vi.useFakeTimers();
    const cleanup = reportAgentError("Preview");
    reportAgentError("Actual operation failed");
    cleanup();
    expect(getAgentSnapshot().detail).toBe("Actual operation failed");
    vi.advanceTimersByTime(ERROR_VISIBLE_MS);
    const cancel = reportAgentError("Preview again");
    cancel();
    expect(getAgentSnapshot().state).toBe("idle");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not treat cancellation as an error", async () => {
    await expect(
      track("thinking", null, async () => {
        throw new DOMException("cancelled", "AbortError");
      }),
    ).rejects.toThrow("cancelled");
    await new Promise((resolve) => setTimeout(resolve, IDLE_GRACE_MS + 50));
    expect(getAgentSnapshot().state).toBe("idle");
  });
});
