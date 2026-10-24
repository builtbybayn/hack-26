/**
 * ElevenLabs adapter. Server-only: the API key never leaves the server, and nothing here is
 * imported by client code. Check https://elevenlabs.io/docs before changing endpoints or models.
 */
import "server-only";

import type { SpeakRequest, VoiceOption, VoiceQuality, VoicesResult } from "@/types/voice";
import { VoiceError } from "./errors";
import { PRESET_VOICES } from "./presets";

const API_BASE = "https://api.elevenlabs.io";

export function isVoiceConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/** `fast` defaults to Flash v2.5 (lowest latency and cost); `high` to Multilingual v2. */
export function modelFor(quality: VoiceQuality = "fast"): string {
  return quality === "high"
    ? (process.env.ELEVENLABS_MODEL_HIGH ?? "eleven_multilingual_v2")
    : (process.env.ELEVENLABS_MODEL_FAST ?? "eleven_flash_v2_5");
}

/** Streams MP3 audio for one segment of text. */
export async function streamSpeech(
  request: SpeakRequest,
  signal?: AbortSignal,
): Promise<{ body: ReadableStream<Uint8Array>; contentType: string }> {
  const voice = encodeURIComponent(request.voiceId);
  const response = await fetch(
    `${API_BASE}/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      signal,
      headers: {
        "xi-api-key": apiKey(),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: request.text,
        model_id: modelFor(request.quality),
        previous_text: request.previousText,
        next_text: request.nextText,
      }),
    },
  );
  if (!response.ok || !response.body) throw await providerError(response);
  return { body: response.body, contentType: response.headers.get("content-type") ?? "audio/mpeg" };
}

/** Presets confirmed against the account, plus the account's other voices (clones, saved, …). */
export async function listVoices(signal?: AbortSignal): Promise<VoicesResult> {
  const presetIds = PRESET_VOICES.map((voice) => voice.id);
  const [presetMatches, allVoices] = await Promise.all([
    getVoices({ voice_ids: presetIds.join(","), page_size: "100" }, signal),
    getVoices({ page_size: "100", sort: "name", sort_direction: "asc" }, signal),
  ]);
  const found = new Map(presetMatches.map((voice) => [voice.voice_id, voice]));
  const presets = PRESET_VOICES.flatMap((preset) => {
    const voice = found.get(preset.id);
    return voice ? [{ ...toOption(voice), name: preset.name, category: "preset" }] : [];
  });
  const account = allVoices
    .filter((voice) => voice.category !== "premade" && !presetIds.includes(voice.voice_id))
    .map(toOption);
  return { configured: true, presets, account };
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category?: string;
  description?: string | null;
  labels?: Record<string, string>;
  preview_url?: string | null;
}

async function getVoices(
  query: Record<string, string>,
  signal?: AbortSignal,
): Promise<ElevenLabsVoice[]> {
  const params = new URLSearchParams({ include_total_count: "false", ...query });
  const response = await fetch(`${API_BASE}/v2/voices?${params}`, {
    signal,
    headers: { "xi-api-key": apiKey() },
  });
  if (!response.ok) throw await providerError(response);
  const body = (await response.json()) as { voices?: ElevenLabsVoice[] };
  return body.voices ?? [];
}

function toOption(voice: ElevenLabsVoice): VoiceOption {
  const labels = voice.labels ?? {};
  const traits = [labels.descriptive ?? labels.description, labels.accent, labels.use_case]
    .filter(Boolean)
    .join(" · ");
  return {
    id: voice.voice_id,
    name: voice.name,
    description: voice.description?.trim() || traits || null,
    category: voice.category ?? "unknown",
    previewUrl: voice.preview_url ?? null,
  };
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    throw new VoiceError(
      "VOICE_NOT_CONFIGURED",
      "ElevenLabs is not configured on the server.",
      503,
    );
  }
  return key;
}

async function providerError(response: Response): Promise<VoiceError> {
  let detail: { status?: string; message?: string } = {};
  try {
    const body = (await response.json()) as { detail?: unknown };
    detail =
      typeof body.detail === "object" && body.detail
        ? (body.detail as typeof detail)
        : { message: String(body.detail ?? "") };
  } catch {
    // Non-JSON error bodies fall through to the status-based mapping below.
  }
  const reason = `${detail.status ?? ""} ${detail.message ?? ""}`;
  if (/quota/i.test(reason)) {
    return new VoiceError("VOICE_QUOTA_EXCEEDED", "The ElevenLabs account is out of credits.", 402);
  }
  if (response.status === 401) {
    return new VoiceError("VOICE_PROVIDER_ERROR", "ElevenLabs rejected the server's API key.", 502);
  }
  if (response.status === 404 || /voice_not_found/i.test(reason)) {
    return new VoiceError(
      "VOICE_NOT_FOUND",
      "That voice isn't available to this ElevenLabs account.",
      404,
    );
  }
  if (response.status === 429) {
    return new VoiceError("VOICE_RATE_LIMITED", "ElevenLabs is busy. Try again in a moment.", 429);
  }
  return new VoiceError(
    "VOICE_PROVIDER_ERROR",
    `ElevenLabs request failed (HTTP ${response.status}).`,
    502,
  );
}
