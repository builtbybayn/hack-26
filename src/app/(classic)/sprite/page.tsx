import type { Metadata } from "next";
import { FluidPreview } from "@/features/agent/FluidPreview";

export const metadata: Metadata = { title: "Fluid Research · Fluid matter" };

export default function SpritePage() {
  return <FluidPreview />;
}
