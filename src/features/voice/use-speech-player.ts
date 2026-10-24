/**
 * Plays a list of reading segments as continuous speech.
 *
 * - ElevenLabs voices: each segment is fetched once (or read from the browser cache), the next
 *   two are prefetched one at a time while the current one plays, and neighbouring text is sent
 *   so intonation carries across segments. Result: no gaps, and replays cost nothing.
 * - Browser voice: the built-in speech synthesizer, sentence by sentence (long utterances are
 *   cut off by some browsers). Used when ElevenLabs isn't configured.
 *
 * Only one player on the page speaks at a time; starting one stops the other.
 */
import { useEffect, useRef, useState } from "react";
import { beginActivity, reportAgentError } from "@/lib/agent-activity";
import { speak } from "@/lib/api/voice-client";
import { cacheAudio, getCachedAudio, saveReadingPosition } from "@/lib/browser-store";
import { segmentContext } from "@/lib/voice/reading-script";
import { BROWSER_VOICE_ID, type ReadingSegment, type VoiceQuality } from "@/types/voice";

export type PlayerStatus = "idle" | "loading" | "playing" | "paused";

export interface PlayerState {
  status: PlayerStatus;
  /** Segment being read, or the last one read. */
  index: number | null;
  error: string | null;
}

interface PlayerOptions {
  segments: ReadingSegment[];
  voiceId: string;
  quality: VoiceQuality;
  rate: number;
  /** When set, the reading position is saved so the paper can be resumed later. */
  documentId?: string;
}

interface Session {
  id: number;
  controller: AbortController;
}

let stopOtherPlayer: (() => void) | null = null;
let nextSessionId = 1;

export function useSpeechPlayer(options: PlayerOptions) {
  const [state, setState] = useState<PlayerState>({ status: "idle", index: null, error: null });
  const optionsRef = useRef(options);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const loadsRef = useRef(new Map<string, Promise<Blob>>());
  const haltRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    optionsRef.current = options;
    if (audioRef.current) audioRef.current.playbackRate = options.rate;
  });

  const isCurrent = (session: Session) => sessionRef.current?.id === session.id;

  /** Stops sound and pending requests without touching React state (safe on unmount). */
  const halt = () => {
    sessionRef.current?.controller.abort();
    sessionRef.current = null;
    audioRef.current?.pause();
    if (typeof window !== "undefined") window.speechSynthesis?.cancel();
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    if (stopOtherPlayer === haltRef.current) stopOtherPlayer = null;
  };
  useEffect(() => {
    haltRef.current = halt;
  });
  useEffect(() => () => haltRef.current(), []);

  // Report what the voice is doing to the assistant's activity state (the sprite).
  useEffect(() => {
    if (state.status === "loading") return beginActivity("preparing-voice", "Generating speech");
    if (state.status === "playing") return beginActivity("speaking", "Reading aloud");
  }, [state.status]);

  const fail = (session: Session, message: string) => {
    if (!isCurrent(session)) return;
    halt();
    setState((current) => ({ ...current, status: "idle", error: message }));
    reportAgentError(message);
  };

  const remember = (index: number) => {
    const { documentId } = optionsRef.current;
    if (documentId) void saveReadingPosition(documentId, index).catch(() => undefined);
  };

  const load = (index: number, signal: AbortSignal): Promise<Blob> => {
    const { segments, voiceId, quality } = optionsRef.current;
    const loadKey = `${voiceId}|${quality}|${index}`;
    const existing = loadsRef.current.get(loadKey);
    if (existing) return existing;
    const promise = (async () => {
      const text = segments[index].text;
      const key = await audioCacheKey(voiceId, quality, text);
      const cached = await getCachedAudio(key).catch(() => null);
      if (cached) return cached;
      const result = await speak(
        { text, voiceId, quality, ...segmentContext(segments, index) },
        signal,
      );
      if (!result.ok) throw new Error(result.error.message);
      void cacheAudio(key, result.audio).catch(() => undefined);
      return result.audio;
    })();
    loadsRef.current.set(loadKey, promise);
    promise.catch(() => loadsRef.current.delete(loadKey));
    return promise;
  };

  const advance = (index: number, session: Session) => {
    if (!isCurrent(session)) return;
    if (index + 1 < optionsRef.current.segments.length) {
      void playSegment(index + 1, session);
      return;
    }
    halt();
    remember(0);
    setState({ status: "idle", index: null, error: null });
  };

  const playSegment = async (index: number, session: Session) => {
    const { segments, voiceId } = optionsRef.current;
    if (voiceId === BROWSER_VOICE_ID) {
      playWithBrowserVoice(index, session);
      return;
    }
    setState({ status: "loading", index, error: null });
    let audioBlob: Blob;
    try {
      audioBlob = await load(index, session.controller.signal);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        fail(session, error instanceof Error ? error.message : "Couldn't generate speech.");
      }
      return;
    }
    if (!isCurrent(session)) return;

    const audio = (audioRef.current ??= new Audio());
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = URL.createObjectURL(audioBlob);
    audio.src = objectUrlRef.current;
    audio.playbackRate = optionsRef.current.rate;
    audio.onended = () => advance(index, session);
    try {
      await audio.play();
    } catch {
      if (isCurrent(session)) {
        setState({ status: "paused", index, error: "Press play to start the audio." });
      }
      return;
    }
    if (!isCurrent(session)) return;
    setState({ status: "playing", index, error: null });
    remember(index);
    // Prefetch the next two segments one at a time, staying within provider concurrency limits.
    const { signal } = session.controller;
    if (index + 1 < segments.length) {
      void load(index + 1, signal)
        .then(() => (index + 2 < segments.length ? load(index + 2, signal) : undefined))
        .catch(() => undefined);
    }
  };

  const playWithBrowserVoice = (index: number, session: Session) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      fail(session, "This browser has no built-in voice. Choose an ElevenLabs voice.");
      return;
    }
    synth.cancel();
    const sentences = optionsRef.current.segments[index].text
      .split(/(?<=[.!?])\s+/)
      .filter(Boolean);
    let next = 0;
    const speakNext = () => {
      if (!isCurrent(session)) return;
      if (next >= sentences.length) {
        advance(index, session);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(sentences[next++]);
      utterance.rate = optionsRef.current.rate;
      utterance.onend = speakNext;
      utterance.onerror = (event) => {
        if (event.error !== "interrupted" && event.error !== "canceled") {
          fail(session, "The browser voice stopped unexpectedly.");
        }
      };
      synth.speak(utterance);
    };
    setState({ status: "playing", index, error: null });
    remember(index);
    speakNext();
  };

  const playFrom = (index: number) => {
    const { segments } = optionsRef.current;
    if (!segments.length) return;
    if (stopOtherPlayer && stopOtherPlayer !== haltRef.current) stopOtherPlayer();
    halt();
    stopOtherPlayer = haltRef.current;
    const session = { id: nextSessionId++, controller: new AbortController() };
    sessionRef.current = session;
    void playSegment(Math.max(0, Math.min(index, segments.length - 1)), session);
  };

  const pause = () => {
    if (optionsRef.current.voiceId === BROWSER_VOICE_ID) window.speechSynthesis?.pause();
    else audioRef.current?.pause();
    setState((current) => ({ ...current, status: "paused" }));
  };

  const resume = () => {
    if (!sessionRef.current) {
      playFrom(state.index ?? 0);
      return;
    }
    if (optionsRef.current.voiceId === BROWSER_VOICE_ID) window.speechSynthesis?.resume();
    else void audioRef.current?.play();
    setState((current) => ({ ...current, status: "playing", error: null }));
  };

  const stop = () => {
    halt();
    setState((current) => ({ ...current, status: "idle" }));
  };

  return {
    state,
    playFrom,
    pause,
    resume,
    stop,
    /** Play from `startIndex` when idle; otherwise pause, resume, or cancel a pending load. */
    toggle: (startIndex = 0) => {
      if (state.status === "loading") stop();
      else if (state.status === "playing") pause();
      else if (state.status === "paused") resume();
      else playFrom(state.index ?? startIndex);
    },
    next: () => playFrom((state.index ?? -1) + 1),
    previous: () => playFrom(Math.max(0, (state.index ?? 1) - 1)),
  };
}

async function audioCacheKey(
  voiceId: string,
  quality: VoiceQuality,
  text: string,
): Promise<string> {
  const source = `${voiceId}|${quality}|${text}`;
  if (!globalThis.crypto?.subtle) return source;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
