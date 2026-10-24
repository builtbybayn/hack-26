"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getReadingPosition } from "@/lib/browser-store";
import { buildReadingScript } from "@/lib/voice/reading-script";
import type { ParsedDocument } from "@/types/ingestion";
import { BROWSER_VOICE_ID, type VoiceQuality } from "@/types/voice";
import {
  PLAYBACK_RATES,
  resolveVoice,
  updateVoicePreferences,
  useVoiceCatalog,
  useVoicePreferences,
} from "./preferences";
import { useSpeechPlayer } from "./use-speech-player";
import { VoicePicker } from "./VoicePicker";
import "./voice.css";

/** Roughly 150 spoken words per minute. */
const CHARACTERS_PER_MINUTE = 900;

interface ReadAloudPanelProps {
  document: ParsedDocument;
  /** Opens a PDF page, for notices about equations and code that are not read aloud. */
  onOpenPage?: (pageNumber: number) => void;
}

/** Reads the paper aloud with a synchronized, clickable transcript. */
export function ReadAloudPanel({ document, onOpenPage }: ReadAloudPanelProps) {
  const script = useMemo(() => buildReadingScript(document), [document]);
  const preferences = useVoicePreferences();
  const voice = resolveVoice(preferences.voice, useVoiceCatalog());
  const player = useSpeechPlayer({
    segments: script.segments,
    voiceId: voice.id,
    quality: preferences.quality,
    rate: preferences.rate,
    documentId: document.id,
  });
  const [savedIndex, setSavedIndex] = useState<number | null>(null);
  const transcriptRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let active = true;
    void getReadingPosition(document.id)
      .then((index) => {
        if (active && index && index < script.segments.length) setSavedIndex(index);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [document.id, script.segments.length]);

  const { status, index, error } = player.state;
  const currentIndex = index ?? savedIndex;
  const currentSection = currentIndex === null ? null : script.segments[currentIndex]?.sectionIndex;

  // Keep the segment being read in view inside the transcript.
  useEffect(() => {
    const list = transcriptRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!list || !item || index === null) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ top: item.offsetTop - 24, behavior: reduceMotion ? "auto" : "smooth" });
  }, [index]);

  if (!script.segments.length) return null;

  const minutes = Math.max(1, Math.round(script.characterCount / CHARACTERS_PER_MINUTE));
  const usesElevenLabs = voice.id !== BROWSER_VOICE_ID;
  const playLabel =
    status === "playing"
      ? "Pause"
      : status === "loading"
        ? "Cancel"
        : status === "paused" || (status === "idle" && savedIndex)
          ? "Resume"
          : "Play";

  return (
    <section className="read-aloud" aria-labelledby="read-aloud-title">
      <div className="panel-heading">
        <div>
          <span className="step">LISTEN</span>
          <h2 id="read-aloud-title">Read aloud</h2>
        </div>
        <p className="read-aloud-meta">
          {script.sections.length} sections · about {minutes} min
          {usesElevenLabs &&
            ` · ${script.characterCount.toLocaleString()} characters for the full paper; replays are cached · Voice by ElevenLabs`}
        </p>
      </div>

      <div className="read-aloud-controls">
        <div className="transport">
          <button type="button" className="primary" onClick={() => player.toggle(savedIndex ?? 0)}>
            {playLabel}
          </button>
          <button type="button" className="secondary" onClick={player.previous}>
            Previous
          </button>
          <button type="button" className="secondary" onClick={player.next}>
            Next
          </button>
          <button
            type="button"
            className="secondary"
            onClick={player.stop}
            disabled={status === "idle"}
          >
            Stop
          </button>
        </div>
        <label>
          Section
          <select
            value={currentSection ?? ""}
            onChange={(event) =>
              player.playFrom(script.sections[Number(event.target.value)].firstSegmentIndex)
            }
          >
            {currentSection === null && <option value="">Start from…</option>}
            {script.sections.map((section) => (
              <option key={section.index} value={section.index}>
                {section.heading ?? "Opening"}
              </option>
            ))}
          </select>
        </label>
        <label>
          Speed
          <select
            value={preferences.rate}
            onChange={(event) => updateVoicePreferences({ rate: Number(event.target.value) })}
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>
        </label>
        <VoicePicker />
        {usesElevenLabs && (
          <label>
            Quality
            <select
              value={preferences.quality}
              onChange={(event) =>
                updateVoicePreferences({ quality: event.target.value as VoiceQuality })
              }
            >
              <option value="fast">Fast (lower cost)</option>
              <option value="high">High quality</option>
            </select>
          </label>
        )}
      </div>

      <p className={error ? "read-aloud-status failed" : "read-aloud-status"} role="status">
        {error ??
          (status === "loading"
            ? `Preparing audio with ${voice.name}…`
            : status === "playing"
              ? `Reading with ${voice.name}`
              : status === "paused"
                ? "Paused"
                : savedIndex
                  ? "Resume where you left off, or click any paragraph to start there."
                  : "Click any paragraph to start reading from it.")}
      </p>

      <ol className="transcript" ref={transcriptRef}>
        {script.segments.map((segment) => (
          <li
            key={segment.index}
            data-index={segment.index}
            className={
              segment.index === currentIndex
                ? `transcript-${segment.kind} current`
                : `transcript-${segment.kind}`
            }
            aria-current={segment.index === index ? "true" : undefined}
          >
            <button type="button" onClick={() => player.playFrom(segment.index)}>
              {segment.text}
            </button>
            {segment.kind === "notice" && segment.pageNumber && onOpenPage && (
              <button
                type="button"
                className="open-page"
                onClick={() => onOpenPage(segment.pageNumber!)}
              >
                Open page {segment.pageNumber}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
