/** One vector mark supplies the Home button and Next.js's automatic favicon. */
export function FluidResearchLogo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <use href="/icon.svg#fluid-mark" />
    </svg>
  );
}
