import type { Metadata, Viewport } from "next";
import { Manrope, Syne } from "next/font/google";

import { PwaBootstrap } from "@/components/pwa-bootstrap";

import "./globals.css";

const display = Syne({
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Synq",
  description:
    "A cinematic private messenger for creators and teams, built for trust-first communication.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#070B12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${body.variable} antialiased`}>
        {children}
        <PwaBootstrap />
      </body>
    </html>
  );
}
