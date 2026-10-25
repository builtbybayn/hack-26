"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  warning?: boolean;
  disabled?: boolean;
}

export type MenuSection = MenuItem[];

/** A right-click menu at the pointer, closed by Escape, a click elsewhere, or scrolling. */
export function ContextMenu({
  x,
  y,
  sections,
  onClose,
}: {
  x: number;
  y: number;
  sections: MenuSection[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu on screen.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - height - 4)),
    });
    element.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [x, y]);

  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event.type === "mousedown" && ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="menu context-menu"
      role="menu"
      style={position}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const buttons = [
          ...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []),
        ];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? index + 1 : index - 1;
        buttons[(next + buttons.length) % buttons.length]?.focus();
      }}
    >
      {sections
        .filter((section) => section.length)
        .map((section, index) => (
          <div key={index} className="menu-section">
            {section.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={item.warning ? "is-warning" : undefined}
                disabled={item.disabled}
                onClick={() => {
                  onClose();
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
    </div>
  );
}
