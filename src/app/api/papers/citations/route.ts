import { z } from "zod";
import { failure, readJson, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import { fetchOpenAlexReferences, ResearchError } from "@/lib/research/provider";

const schema = z.object({
  paperIds: z
    .array(z.string().regex(/^openalex:W\d+$/))
    .min(1)
    .max(20),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request, 5000));
    if (!body.success || new Set(body.data.paperIds).size !== body.data.paperIds.length)
      return failure("INVALID_REQUEST", "Provide one to twenty distinct OpenAlex paper IDs.");
    return success({
      references: await fetchOpenAlexReferences(body.data.paperIds, timeoutSignal(request, 20_000)),
    });
  } catch (error) {
    if (error instanceof ResearchError)
      return failure(error.code, error.message, error.code === "SEARCH_RATE_LIMITED" ? 429 : 502);
    return routeError(error, "api/papers/citations");
  }
}
