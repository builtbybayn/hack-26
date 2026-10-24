import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { createQuiz } from "@/lib/intelligence/tutor";

const schema = z.object({ documentId: z.string(), conceptId: z.string() });
export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success) return failure("INVALID_REQUEST", "The quiz request is invalid.");
    return success(await createQuiz(body.data.documentId, body.data.conceptId));
  } catch (error) {
    return routeError(error, "api/quiz");
  }
}
