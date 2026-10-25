"use client";

import { useEffect, useRef } from "react";
import type { AgentState } from "@/lib/agent-activity";
import { advanceWeights, formWeights, materialColor } from "./fluid-forms";
import { createFluidRenderer } from "./fluid-renderer";
import "./agent-sprite.css";

export function FluidMatter({ state, paused = false }: { state: AgentState; paused?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const activity = useRef(state);
  const pause = useRef(paused);
  const wake = useRef<() => void>(() => {});
  const pointer = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    activity.current = state;
    pause.current = paused;
    wake.current();
  }, [state, paused]);

  useEffect(() => {
    const surface = canvas.current;
    if (!surface) return;
    let renderer = createFluidRenderer(surface);
    let frame = 0;
    let previous = 0;
    let time = 0;
    let weights = formWeights(activity.current);
    let visible = true;
    let lost = false;
    let color = materialColor(getComputedStyle(surface).color);
    let targetColor = color;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    const attraction: [number, number] = [0, 0];

    function draw(now: number) {
      if (!surface || !renderer || lost) return;
      const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 1 / 60;
      previous = now;
      const still = pause.current || reduced.matches;
      if (!still) time += dt;
      weights = still
        ? formWeights(activity.current)
        : advanceWeights(weights, activity.current, dt);
      color = still
        ? targetColor
        : (color.map(
            (channel, index) =>
              channel + (targetColor[index] - channel) * (1 - Math.exp(-dt * 3.2)),
          ) as [number, number, number]);
      for (const index of [0, 1] as const) {
        attraction[index] +=
          ((still ? 0 : pointer.current[index]) - attraction[index]) * (1 - Math.exp(-dt * 4));
      }
      renderer.render({ time: reduced.matches ? 0 : time, weights, pointer: attraction, color });
      surface.dataset.ready = "true";
      if (!still && visible && !document.hidden) frame = requestAnimationFrame(draw);
    }
    function restart() {
      cancelAnimationFrame(frame);
      previous = 0;
      if (surface) targetColor = materialColor(getComputedStyle(surface).color);
      if (visible && !document.hidden && !lost) frame = requestAnimationFrame(draw);
    }
    function resize() {
      if (!surface) return;
      const size = surface.getBoundingClientRect();
      // Cap the preview's fragment budget; small panel sprites still get retina rendering.
      const ratio = Math.min(
        Math.max(devicePixelRatio || 1, 2),
        2.5,
        960 / Math.max(size.width, size.height, 1),
      );
      surface.width = Math.max(1, Math.round(size.width * ratio));
      surface.height = Math.max(1, Math.round(size.height * ratio));
      restart();
    }
    function updateTheme() {
      restart();
    }
    function contextLost(event: Event) {
      event.preventDefault();
      lost = true;
      cancelAnimationFrame(frame);
      surface?.removeAttribute("data-ready");
    }
    function contextRestored() {
      renderer?.dispose();
      renderer = surface ? createFluidRenderer(surface) : null;
      lost = false;
      restart();
    }
    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) restart();
      else cancelAnimationFrame(frame);
    });
    intersection.observe(surface);
    const dimensions = new ResizeObserver(resize);
    dimensions.observe(surface);
    const theme = new MutationObserver(updateTheme);
    // Observe attributes on ancestors only; animation writes never trigger this observer.
    for (let parent = surface.parentElement; parent; parent = parent.parentElement) {
      theme.observe(parent, {
        attributes: true,
        attributeFilter: ["class", "data-theme", "style"],
      });
    }
    const systemTheme = matchMedia("(prefers-color-scheme: light)");
    systemTheme.addEventListener("change", updateTheme);
    reduced.addEventListener("change", restart);
    document.addEventListener("visibilitychange", restart);
    surface.addEventListener("webglcontextlost", contextLost);
    surface.addEventListener("webglcontextrestored", contextRestored);
    wake.current = restart;
    resize();
    return () => {
      cancelAnimationFrame(frame);
      intersection.disconnect();
      dimensions.disconnect();
      theme.disconnect();
      reduced.removeEventListener("change", restart);
      systemTheme.removeEventListener("change", updateTheme);
      document.removeEventListener("visibilitychange", restart);
      surface.removeEventListener("webglcontextlost", contextLost);
      surface.removeEventListener("webglcontextrestored", contextRestored);
      renderer?.dispose();
      wake.current = () => {};
    };
  }, []);

  return (
    <span className="fluid-matter" aria-hidden="true" data-state={state}>
      <span className="fluid-matter-fallback" />
      <canvas
        ref={canvas}
        className="fluid-matter-canvas"
        onPointerMove={(event) => {
          if (event.pointerType === "touch") return;
          const bounds = event.currentTarget.getBoundingClientRect();
          pointer.current = [
            Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width) * 2 - 1)),
            Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height) * 2 - 1)),
          ];
        }}
        onPointerLeave={() => {
          pointer.current = [0, 0];
        }}
      />
    </span>
  );
}
