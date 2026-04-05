import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Synq",
    short_name: "Synq",
    description:
      "A cinematic private messenger for creators and teams with ghost mode, trust-first rooms, and friend-ready chat.",
    start_url: "/chat",
    display: "standalone",
    background_color: "#070B12",
    theme_color: "#070B12",
    orientation: "portrait",
    categories: ["social", "productivity", "communication"],
    icons: [
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/apple-icon",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
