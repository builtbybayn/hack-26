import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fluid Research",
  description:
    "A research workspace: read and annotate papers, learn their prerequisites, check evidence against the literature, and write with citations.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
