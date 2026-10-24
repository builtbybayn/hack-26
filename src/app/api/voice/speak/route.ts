import { z } from "zod";
import { failure, readJson, routeError, timeoutSignal } from "@/lib/api/route-helpers";
import { streamSpeech } from "@/lib/voice/elevenlabs";
import { VoiceError } from "@/lib/voice/errors";
import { VOICE_ID_PATTERN } from "@/lib/voice/presets";
import { MAX_SPEECH_CHARACTERS } from "@/types/voice";

const schema = z.object({
  text: z.string().trim().min(1),
  voiceId: z.string().regex(VOICE_ID_PATTERN),
  quality: z.enum(["fast", "high"]).optional(),
  previousText: z.string().max(1_000).optional(),
  nextText: z.string().max(1_000).optional(),
});

/**
 * POST /api/voice/speak: JSON `SpeakRequest` → streamed `audio/mpeg`.
 * Errors use the standard JSON envelope. See docs/ARCHITECTURE.md.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = schema.safeParse(await readJson(request, 100_000));
    if (!body.success) return failure("INVALID_REQUEST", "Provide text and a valid voice id.");
    if (body.data.text.length > MAX_SPEECH_CHARACTERS) {
      return failure(
        "TEXT_TOO_LONG",
        `Send at most ${MAX_SPEECH_CHARACTERS} characters per request.`,
        413,
      );
    }
    const audio = await streamSpeech(body.data, timeoutSignal(request, 60_000));
    return new Response(audio.body, {
      headers: { "Content-Type": audio.contentType, "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof VoiceError) return failure(error.code, error.message, error.status);
    return routeError(error, "api/voice/speak");
  }
}
