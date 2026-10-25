"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Moon, Pause, Play, Sun } from "lucide-react";
import { AGENT_STATES, type AgentState } from "@/lib/agent-activity";
import { FluidMatter } from "./FluidMatter";
import { FLUID_FORMS, FLUID_STATES } from "./fluid-forms";
import "@/components/theme/obsidian-theme.css";
import styles from "./fluid-preview.module.css";

export function FluidPreview() {
  const [state, setState] = useState<AgentState>("idle");
  const [light, setLight] = useState(false);
  const [paused, setPaused] = useState(false);
  const [cycle, setCycle] = useState(false);
  useEffect(() => {
    if (!cycle || paused) return;
    const timer = setInterval(
      () =>
        setState(
          (current) => FLUID_STATES[(FLUID_STATES.indexOf(current) + 1) % FLUID_STATES.length],
        ),
      5000,
    );
    return () => clearInterval(timer);
  }, [cycle, paused]);
  return (
    <main className={`theme-obsidian ${styles.page}`} data-theme={light ? "light" : "dark"}>
      <header className={styles.header}>
        <Link href="/panel">
          <ArrowLeft size={15} /> Back to assistant
        </Link>
        <span>KnowBefore / Matter study</span>
        <button
          className="clickable-icon"
          onClick={() => setLight(!light)}
          aria-label={light ? "Use dark theme" : "Use light theme"}
        >
          {light ? <Moon size={17} /> : <Sun size={17} />}
        </button>
      </header>
      <div className={styles.workspace}>
        <section className={styles.study} aria-label="Fluid matter preview">
          <div className={styles.intro}>
            <span className={styles.eyebrow}>One material. Many forms.</span>
            <h1>Thought, in motion.</h1>
            <p>A little matter with a mind of its own.</p>
          </div>
          <div className={styles.stage}>
            <FluidMatter state={state} paused={paused} />
          </div>
          <div className={styles.caption} aria-live="polite">
            <span className={styles.eyebrow}>{AGENT_STATES[state].label}</span>
            <h2>{FLUID_FORMS[state].name}</h2>
            <p>{FLUID_FORMS[state].description}</p>
          </div>
          <div className={styles.controls}>
            <button className="mod-muted" aria-pressed={paused} onClick={() => setPaused(!paused)}>
              {paused ? <Play size={14} /> : <Pause size={14} />}
              {paused ? "Resume" : "Pause motion"}
            </button>
            <label>
              <input
                type="checkbox"
                checked={cycle}
                onChange={(event) => setCycle(event.target.checked)}
              />{" "}
              Cycle forms
            </label>
          </div>
          <p className={styles.hint}>Move your pointer around the surface.</p>
        </section>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeading}>
            <h2>Activity forms</h2>
            <span>01 — 09</span>
          </div>
          <div className={styles.forms}>
            {FLUID_STATES.map((candidate, index) => (
              <button
                key={candidate}
                className={styles.form}
                aria-pressed={state === candidate}
                onClick={() => {
                  setCycle(false);
                  setState(candidate);
                }}
              >
                <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{FLUID_FORMS[candidate].name}</strong>
                  <small>{AGENT_STATES[candidate].label}</small>
                </span>
                <span className={styles.indicator} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className={styles.scale}>
            <span className={styles.eyebrow}>In the interface</span>
            <div className={styles.scaleSamples}>
              <div>
                <div className={styles.panelSize}>
                  <FluidMatter state={state} paused={paused} />
                </div>
                <span>Panel · 104 px</span>
              </div>
              <div>
                <div className={styles.compactSize}>
                  <FluidMatter state={state} paused={paused} />
                </div>
                <span>Compact · 56 px</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
