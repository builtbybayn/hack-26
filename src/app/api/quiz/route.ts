import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { conceptSchema } from "@/lib/intelligence/schema";
import { createQuiz } from "@/lib/intelligence/tutor";

const schema = z.object({ concept: conceptSchema });
export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success) return failure("INVALID_REQUEST", "The quiz request is invalid.");
    return success(await createQuiz(body.data.concept));
  } catch (error) {
    return routeError(error, "api/quiz");
  }
}
