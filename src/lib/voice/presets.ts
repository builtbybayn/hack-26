import type { VoiceOption } from "@/types/voice";

const preset = (id: string, name: string): VoiceOption => ({
  id,
  name,
  description: null,
  category: "preset",
  previewUrl: null,
});

/**
 * Curated narration voices from ElevenLabs' premade library. The server confirms each id against
 * the account at runtime and drops any that are unavailable, so a stale id never reaches the UI.
 */
export const PRESET_VOICES: VoiceOption[] = [
  preset("JBFqnCBsd6RMkjVDRZzb", "George"),
  preset("Xb7hH8MSUJpSbSDYk0k2", "Alice"),
  preset("nPczCjzI2devNBz1zQrb", "Brian"),
  preset("XrExE9yKIg1WjnnlVkGX", "Matilda"),
];

/** ElevenLabs voice ids are short alphanumeric strings; anything else is rejected before use. */
export const VOICE_ID_PATTERN = /^[A-Za-z0-9]{8,40}$/;
