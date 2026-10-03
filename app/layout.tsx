import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wallet RPG — Your Wallet Is Your Fighter",
  description: "Turn any wallet string into a deterministic RPG fighter and challenge a rival.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
