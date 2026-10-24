import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { explainConcept } from "@/lib/intelligence/tutor";

const schema = z.object({
  documentId: z.string(),
  conceptId: z.string(),
  style: z.enum(["beginner", "technical", "analogy", "worked-example"]),
  question: z.string().max(1000).optional(),
});
export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success) return failure("INVALID_REQUEST", "The explanation request is invalid.");
    return success(await explainConcept(body.data));
  } catch (error) {
    return routeError(error, "api/explain");
  }
}
