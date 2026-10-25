import { failure, readJson, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import {
  recommendationsSchema,
  recommendPapers,
  searchTopicPapers,
  topicRecommendationsSchema,
} from "@/lib/research/recommendations";
import { ResearchError } from "@/lib/research/provider";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    const topic = topicRecommendationsSchema.safeParse(body);
    if (topic.success)
      return success(await searchTopicPapers(topic.data, timeoutSignal(request, 20_000)));
    const document = recommendationsSchema.safeParse(body);
    if (!document.success)
      return failure(
        "INVALID_REQUEST",
        "Provide a topic or an analyzed document and a valid limit.",
      );
    return success(await recommendPapers(document.data, timeoutSignal(request, 20_000)));
  } catch (error) {
    if (error instanceof ResearchError)
      return failure(error.code, error.message, error.code === "SEARCH_RATE_LIMITED" ? 429 : 502);
    if (error instanceof DOMException && error.name === "TimeoutError")
      return failure("REQUEST_TIMEOUT", "The paper search timed out. Please retry.", 504);
    return routeError(error, "api/recommendations");
  }
}
