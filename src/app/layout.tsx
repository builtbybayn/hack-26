import type { Metadata } from "next";
import "@xyflow/react/dist/style.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "KnowBefore",
  description:
    "A research vault for papers: read, annotate, and ask AI, with prerequisites, related work, and conflicts checked against the literature.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
