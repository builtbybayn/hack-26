import type { IntelligenceErrorCode } from "@/types/intelligence";

export class IntelligenceError extends Error {
  constructor(
    public readonly code: IntelligenceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "IntelligenceError";
  }
}
