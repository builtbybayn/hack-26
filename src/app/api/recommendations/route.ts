import { failure, readJson, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import { recommendationsSchema, recommendPapers } from "@/lib/research/recommendations";
import { ResearchError } from "@/lib/research/provider";

export async function POST(request: Request): Promise<Response> {
  try {
    const parsed = recommendationsSchema.safeParse(await readJson(request));
    if (!parsed.success)
      return failure(
        "INVALID_REQUEST",
        "Provide a parsed document, its analysis, and an optional limit from 1 to 20.",
      );
    return success(await recommendPapers(parsed.data, timeoutSignal(request, 20_000)));
  } catch (error) {
    if (error instanceof ResearchError)
      return failure(error.code, error.message, error.code === "SEARCH_RATE_LIMITED" ? 429 : 502);
    if (error instanceof DOMException && error.name === "TimeoutError")
      return failure("REQUEST_TIMEOUT", "The paper search timed out. Please retry.", 504);
    return routeError(error, "api/recommendations");
  }
}
