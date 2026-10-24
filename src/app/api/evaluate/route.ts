import { z } from "zod";
import { failure, readJson, routeError, success } from "@/lib/api/route-helpers";
import { quizSchema } from "@/lib/intelligence/schema";
import { evaluateQuiz } from "@/lib/intelligence/tutor";

const schema = z.object({
  quiz: quizSchema,
  answers: z.record(z.string(), z.string()),
});
export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success) return failure("INVALID_REQUEST", "The quiz submission is invalid.");
    return success(evaluateQuiz(body.data.quiz, body.data.answers));
  } catch (error) {
    return routeError(error, "api/evaluate");
  }
}
