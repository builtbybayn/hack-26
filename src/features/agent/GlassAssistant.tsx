"use client";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export interface GlassInteraction {
  x: number;
  y: number;
  stretch: number;
  ripple?: boolean;
  active?: boolean;
}
export interface GlassAssistantHandle {
  setInteraction: (interaction: GlassInteraction) => void;
}

/** The supplied UI's glass/liquid blob, driven by the real app's activity adapter. */
const GlassAssistant = forwardRef<
  GlassAssistantHandle,
  {
    state: "idle" | "researching" | "error";
    className?: string;
    contrastBackdrop?: boolean;
  }
>(function GlassAssistant({ state, className = "", contrastBackdrop = false }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const sprite = useRef<{
    setState: (state: "idle" | "researching" | "error") => boolean;
    setInteraction: (interaction: GlassInteraction) => void;
    setContrastBackdrop: (enabled: boolean) => void;
    dispose: () => void;
  } | null>(null);
  const latest = useRef(state);
  const latestBackdrop = useRef(contrastBackdrop);
  useEffect(() => {
    latest.current = state;
    sprite.current?.setState(state);
  }, [state]);
  useEffect(() => {
    latestBackdrop.current = contrastBackdrop;
    sprite.current?.setContrastBackdrop(contrastBackdrop);
  }, [contrastBackdrop]);
  useImperativeHandle(
    ref,
    () => ({ setInteraction: (interaction) => sprite.current?.setInteraction(interaction) }),
    [],
  );
  useEffect(() => {
    let cancelled = false;
    void import("./glass-sprite/research-sprite.js")
      .then(({ ResearchSprite }) => {
        if (!host.current || cancelled) return;
        try {
          sprite.current = new ResearchSprite({
            container: host.current,
            transparent: true,
            state: latest.current,
          });
          sprite.current.setContrastBackdrop(latestBackdrop.current);
        } catch {
          /* Assistant controls remain available if WebGL cannot initialize. */
        }
      })
      .catch(() => {
        /* Assistant controls remain available if the renderer cannot load. */
      });
    return () => {
      cancelled = true;
      sprite.current?.dispose();
      sprite.current = null;
    };
  }, []);
  return <div ref={host} className={className} aria-hidden="true" />;
});
export default GlassAssistant;
