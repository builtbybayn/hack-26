"use client";

import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";

/** Portal tooltips escape the fixed explorer's stacking and clipping contexts. */
export function RailTooltip({
  label,
  children,
  className = "",
}: {
  label: string;
  className?: string;
  children: ReactElement<{ "aria-describedby"?: string }>;
}) {
  const id = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  function cancel() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  function hide() {
    cancel();
    setPosition(null);
  }
  function show() {
    cancel();
    const target = anchor.current?.firstElementChild;
    const rail = anchor.current?.closest("nav") || document.querySelector(".workspace-rail");
    if (!target || !rail) return;
    const rect = target.getBoundingClientRect();
    setPosition({ left: rail.getBoundingClientRect().right + 7, top: rect.top + rect.height / 2 });
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    if (!position) return;
    const dismiss = () => setPosition(null);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);
    return () => {
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [position]);
  return (
    <div
      ref={anchor}
      className={`rail-tooltip-anchor ${className}`}
      onPointerEnter={(event) => {
        if (event.pointerType !== "touch") {
          cancel();
          timer.current = setTimeout(show, 425);
        }
      }}
      onPointerLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => {
        if (event.key === "Escape") hide();
      }}
    >
      {cloneElement(children, { "aria-describedby": position ? id : undefined })}
      {position &&
        createPortal(
          <span id={id} role="tooltip" className="fluid-rail-tooltip" style={position}>
            {label}
          </span>,
          document.body,
        )}
    </div>
  );
}
