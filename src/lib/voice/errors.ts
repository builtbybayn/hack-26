import type { VoiceErrorCode } from "@/types/voice";

/** The only error type the voice module throws on purpose. Carries its HTTP status. */
export class VoiceError extends Error {
  constructor(
    public readonly code: VoiceErrorCode,
    message: string,
    public readonly status: number,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "VoiceError";
  }
}
