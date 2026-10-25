import { z } from "zod";
import { failure, readJson, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import { ResearchError } from "@/lib/research/provider";
import { buildRoadmap } from "@/lib/research/roadmap";
import type { Roadmap } from "@/types/roadmap";

const schema = z.object({
  idea: z.string().trim().min(3).max(2_000),
  previous: z
    .looseObject({
      projectName: z.string(),
      goal: z.string(),
      summary: z.string(),
      stages: z
        .array(
          z.looseObject({
            title: z.string(),
            goal: z.string(),
            concepts: z.array(z.object({ name: z.string(), why: z.string() })),
            searchQuery: z.string(),
            papers: z.array(z.looseObject({ id: z.string(), title: z.string() })),
          }),
        )
        .max(10),
    })
    .optional(),
  conversation: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4_000) }))
    .max(40)
    .optional(),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request, 2_000_000));
    if (!body.success) return failure("INVALID_REQUEST", "Describe the research idea to plan.");
    const { idea, previous, conversation } = body.data;
    return success(
      await buildRoadmap(
        { idea, previous: previous as Roadmap | undefined, conversation },
        timeoutSignal(request, 150_000),
      ),
    );
  } catch (error) {
    if (error instanceof ResearchError)
      return failure(error.code, error.message, error.code === "SEARCH_RATE_LIMITED" ? 429 : 502);
    return routeError(error, "api/roadmap");
  }
}
