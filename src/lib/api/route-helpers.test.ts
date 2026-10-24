import { describe, expect, it } from "vitest";
import { routeError } from "./route-helpers";

describe("routeError", () => {
  it("returns the timeout contract for an expired provider request", async () => {
    const response = routeError(new DOMException("timed out", "TimeoutError"), "test");
    expect(response.status).toBe(504);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: "REQUEST_TIMEOUT" },
    });
  });
});
