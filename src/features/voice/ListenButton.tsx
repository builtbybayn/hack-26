"use client";

import { useMemo } from "react";
import { segmentText } from "@/lib/voice/reading-script";
import { BROWSER_VOICE_ID } from "@/types/voice";
import { resolveVoice, useVoiceCatalog, useVoicePreferences } from "./preferences";
import { useSpeechPlayer } from "./use-speech-player";
import "./voice.css";

/** Reads any generated text aloud with the user's chosen voice: `<ListenButton text={…} />`. */
export function ListenButton({ text }: { text: string }) {
  // A new text gets a fresh player, so audio for the old text never continues.
  return <ListenControl key={text} text={text} />;
}

function ListenControl({ text }: { text: string }) {
  const segments = useMemo(() => segmentText(text), [text]);
  const preferences = useVoicePreferences();
  const voice = resolveVoice(preferences.voice, useVoiceCatalog());
  const player = useSpeechPlayer({
    segments,
    voiceId: voice.id,
    quality: preferences.quality,
    rate: preferences.rate,
  });
  const { status, error } = player.state;
  if (!segments.length) return null;

  return (
    <div className="listen">
      <button type="button" className="secondary" onClick={() => player.toggle(0)}>
        {status === "playing"
          ? "Pause"
          : status === "loading"
            ? "Cancel"
            : status === "paused"
              ? "Resume"
              : "Listen"}
      </button>
      {status !== "idle" && (
        <button type="button" className="secondary" onClick={player.stop}>
          Stop
        </button>
      )}
      <span role="status" className={error ? "failed" : undefined}>
        {error ??
          (status === "loading"
            ? `Preparing ${voice.name}…`
            : voice.id === BROWSER_VOICE_ID
              ? voice.name
              : `${voice.name} · Voice by ElevenLabs`)}
      </span>
    </div>
  );
}
