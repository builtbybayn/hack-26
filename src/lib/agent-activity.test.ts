import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginActivity,
  getAgentSnapshot,
  IDLE_GRACE_MS,
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

    vi.advanceTimersByTime(6_000 + IDLE_GRACE_MS);
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
