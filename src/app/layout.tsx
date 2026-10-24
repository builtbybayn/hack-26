import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "HackPSU 2026",
  description: "HackPSU 2026 project.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
