import { z } from "zod";
import { failure, readJson, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import { answerChat } from "@/lib/intelligence/chat";

const passageSchema = z.object({
  title: z.string().max(500),
  pageNumber: z.number().int().positive(),
  text: z.string().max(5_000),
});

const schema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(20_000),
        passage: passageSchema.optional(),
      }),
    )
    .min(1)
    .max(200)
    .refine((messages) => messages.at(-1)?.role === "user", "The last message must be the user's."),
  papers: z
    .array(
      z.object({
        title: z.string().max(500),
        subject: z.string().max(500).optional(),
        topics: z.array(z.string().max(200)).max(40).optional(),
        pages: z.array(z.object({ pageNumber: z.number().int().positive(), text: z.string() })),
      }),
    )
    .max(5),
});

export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request));
    if (!body.success) return failure("INVALID_REQUEST", "The chat request is invalid.");
    return success(await answerChat(body.data, timeoutSignal(request, 90_000)));
  } catch (error) {
    return routeError(error, "api/chat");
  }
}
