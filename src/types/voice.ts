/**
 * Voice contracts (Track C): reading papers aloud and listening to explanations.
 *
 * `POST /api/voice/speak` is the one route that does not return the JSON envelope on success:
 * it streams `audio/mpeg`. Failures still return `{ ok: false, error }` JSON.
 */
import type { ApiError, ApiResponse, CommonErrorCode } from "./api";

/** Upper bound per speak request. Reading-script segments are far shorter. */
export const MAX_SPEECH_CHARACTERS = 5_000;

/** `fast` is cheaper and quicker (default); `high` is steadier for long narration. */
export type VoiceQuality = "fast" | "high";

/** Id of the built-in browser voice used when ElevenLabs is unavailable. Not ElevenLabs. */
export const BROWSER_VOICE_ID = "browser";

export interface VoiceOption {
  id: string;
  name: string;
  description: string | null;
  /** `preset`, `browser`, or the ElevenLabs category (`premade`, `cloned`, `generated`, …). */
  category: string;
  /** Free sample clip hosted by ElevenLabs; playing it costs no credits. */
  previewUrl: string | null;
}

export interface VoicesResult {
  /** Whether the server has an ElevenLabs key. When false, only the browser voice works. */
  configured: boolean;
  presets: VoiceOption[];
  /** Voices in the ElevenLabs account other than the presets: clones, saved library voices, etc. */
  account: VoiceOption[];
}

export interface SpeakRequest {
  text: string;
  voiceId: string;
  quality?: VoiceQuality;
  /** Neighbouring text so intonation flows across segment boundaries. Not spoken. */
  previousText?: string;
  nextText?: string;
}

export type VoiceErrorCode =
  | "VOICE_NOT_CONFIGURED"
  | "VOICE_NOT_FOUND"
  | "TEXT_TOO_LONG"
  | "VOICE_QUOTA_EXCEEDED"
  | "VOICE_RATE_LIMITED"
  | "VOICE_PROVIDER_ERROR";

export type VoicesResponse = ApiResponse<VoicesResult, VoiceErrorCode | CommonErrorCode>;
export type SpeakError = ApiError<VoiceErrorCode | CommonErrorCode>;

/** One spoken unit of a paper: a heading, a paragraph, or a notice about skipped content. */
export interface ReadingSegment {
  index: number;
  sectionIndex: number;
  kind: "heading" | "paragraph" | "notice";
  /** What is sent to the voice: cleaned for listening. */
  text: string;
  /** PDF page the segment starts on, when known. */
  pageNumber: number | null;
}

export interface ReadingSection {
  index: number;
  heading: string | null;
  firstSegmentIndex: number;
  segmentCount: number;
  characterCount: number;
}

/** A paper prepared for listening. Built in the browser from a `ParsedDocument`; free to build. */
export interface ReadingScript {
  documentId: string;
  sections: ReadingSection[];
  segments: ReadingSegment[];
  /** Total spoken characters: what ElevenLabs would bill to read the whole paper. */
  characterCount: number;
}
