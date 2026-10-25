export class ResearchSprite {
  constructor(options: {
    container: HTMLElement;
    state?: "idle" | "researching" | "error";
    animated?: boolean;
    transparent?: boolean;
  });
  setState(state: "idle" | "researching" | "error"): boolean;
  setInteraction(interaction: {
    x?: number;
    y?: number;
    stretch?: number;
    ripple?: boolean;
    active?: boolean;
  }): void;
  setContrastBackdrop(enabled: boolean): void;
  dispose(): void;
}
