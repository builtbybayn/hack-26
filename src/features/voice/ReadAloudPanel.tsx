"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, Pause, Play, Settings2, SkipBack, SkipForward } from "lucide-react";
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

interface ReadAloudPanelProps {
  document: ParsedDocument;
  /** Opens a PDF page, for notices about equations and code that are not read aloud. */
  onOpenPage?: (pageNumber: number) => void;
}

/**
 * Reads the paper aloud: one compact player row, then the text. Click any paragraph to read
 * from there; voice, quality, and section live behind the settings toggle.
 */
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
  const [settingsOpen, setSettingsOpen] = useState(false);
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
  const currentSection =
    currentIndex === null ? null : (script.segments[currentIndex]?.sectionIndex ?? null);

  // Keep the paragraph being read in view.
  useEffect(() => {
    const list = transcriptRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    if (!list || !item || index === null) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ top: item.offsetTop - 24, behavior: reduceMotion ? "auto" : "smooth" });
  }, [index]);

  if (!script.segments.length) return null;

  const playing = status === "playing";
  const loading = status === "loading";
  const section = currentSection === null ? null : script.sections[currentSection];
  const progress = currentIndex === null ? 0 : ((currentIndex + 1) / script.segments.length) * 100;
  const nextRate = () => {
    const position = PLAYBACK_RATES.indexOf(preferences.rate);
    updateVoicePreferences({ rate: PLAYBACK_RATES[(position + 1) % PLAYBACK_RATES.length] });
  };

  return (
    <section className="read-aloud" aria-label="Read aloud">
      <div className="player">
        <button
          type="button"
          className="player-icon"
          aria-label="Previous paragraph"
          onClick={player.previous}
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          className="player-play"
          aria-label={playing ? "Pause" : loading ? "Cancel" : "Play"}
          onClick={() => player.toggle(savedIndex ?? 0)}
        >
          {loading ? (
            <LoaderCircle size={18} className="player-spin" />
          ) : playing ? (
            <Pause size={18} />
          ) : (
            <Play size={18} />
          )}
        </button>
        <button
          type="button"
          className="player-icon"
          aria-label="Next paragraph"
          onClick={player.next}
        >
          <SkipForward size={16} />
        </button>
        <button
          type="button"
          className="player-rate"
          aria-label={`Speed ${preferences.rate}×`}
          title="Change speed"
          onClick={nextRate}
        >
          {preferences.rate}×
        </button>
        <button
          type="button"
          className="player-icon player-settings"
          aria-label="Voice settings"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen(!settingsOpen)}
        >
          <Settings2 size={16} />
        </button>
      </div>

      <div className="player-progress" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>
      <p className={error ? "player-status failed" : "player-status"} role="status">
        {error ??
          (section
            ? `Section ${section.index + 1} of ${script.sections.length}${section.heading ? ` · ${section.heading}` : ""}`
            : "Click any paragraph to start there.")}
      </p>

      {settingsOpen && (
        <div className="player-settings-panel">
          <VoicePicker />
          {voice.id !== BROWSER_VOICE_ID && (
            <label>
              Quality
              <select
                value={preferences.quality}
                onChange={(event) =>
                  updateVoicePreferences({ quality: event.target.value as VoiceQuality })
                }
              >
                <option value="fast">Fast</option>
                <option value="high">High</option>
              </select>
            </label>
          )}
          <label>
            Section
            <select
              value={currentSection ?? ""}
              onChange={(event) =>
                player.playFrom(script.sections[Number(event.target.value)].firstSegmentIndex)
              }
            >
              {currentSection === null && <option value="">Start from…</option>}
              {script.sections.map((item) => (
                <option key={item.index} value={item.index}>
                  {item.heading ?? "Opening"}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

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
