import type { Metadata, Viewport } from "next";
import { Manrope, Syne } from "next/font/google";

import { AuthProvider } from "@/components/auth-provider";
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
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://synq-app.vercel.app",
  ),
  title: {
    default: "Synq",
    template: "%s · Synq",
  },
  description:
    "A cinematic private messenger for creators and teams, built for trust-first communication.",
  manifest: "/manifest.webmanifest",
  applicationName: "Synq",
  appleWebApp: {
    capable: true,
    title: "Synq",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "512x512" }],
  },
  openGraph: {
    title: "Synq",
    description:
      "Private cinematic messaging with ghost mode, live rooms, and trust-first collaboration.",
    type: "website",
    url: "/chat",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Synq" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Synq",
    description:
      "Private cinematic messaging with ghost mode, live rooms, and trust-first collaboration.",
    images: ["/opengraph-image"],
  },
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
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${display.variable} ${body.variable} antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
        <PwaBootstrap />
      </body>
    </html>
  );
}
