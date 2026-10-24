import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { evaluateQuiz } from "@/lib/intelligence/tutor";

const schema = z.object({
  documentId: z.string(),
  conceptId: z.string(),
  answers: z.record(z.string(), z.string()),
});
export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success) return failure("INVALID_REQUEST", "The quiz submission is invalid.");
    return success(evaluateQuiz(body.data.documentId, body.data.conceptId, body.data.answers));
  } catch (error) {
    return routeError(error, "api/evaluate");
  }
}
