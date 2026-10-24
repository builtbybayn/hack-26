import { connection } from "next/server";
import { failure, routeError, success, timeoutSignal } from "@/lib/api/route-helpers";
import { isVoiceConfigured, listVoices } from "@/lib/voice/elevenlabs";
import { VoiceError } from "@/lib/voice/errors";
import { PRESET_VOICES } from "@/lib/voice/presets";
import type { VoicesResult } from "@/types/voice";

/** GET /api/voice/voices: preset and account voices. Answers (unconfigured) without a key. */
export async function GET(request: Request): Promise<Response> {
  // Read the key per request, not at build time, so adding it later takes effect.
  await connection();
  if (!isVoiceConfigured()) {
    return success({
      configured: false,
      presets: PRESET_VOICES,
      account: [],
    } satisfies VoicesResult);
  }
  try {
    return success(await listVoices(timeoutSignal(request, 15_000)));
  } catch (error) {
    if (error instanceof VoiceError) return failure(error.code, error.message, error.status);
    return routeError(error, "api/voice/voices");
  }
}
