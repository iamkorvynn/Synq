export const synqTheme = {
  colors: {
    graphite: "#070B12",
    panel: "rgba(12, 18, 28, 0.72)",
    panelStrong: "rgba(18, 26, 40, 0.88)",
    silver: "#C9D4E3",
    cyan: "#5DE4FF",
    coral: "#FF7A6E",
    mint: "#98FFD5",
  },
  gradients: {
    aurora:
      "radial-gradient(circle at top, rgba(93, 228, 255, 0.22), transparent 42%), radial-gradient(circle at 80% 20%, rgba(255, 122, 110, 0.18), transparent 24%), linear-gradient(180deg, #06080f 0%, #090f18 48%, #05070b 100%)",
    coralBloom:
      "linear-gradient(135deg, rgba(255, 122, 110, 0.22), rgba(93, 228, 255, 0.16))",
  },
  shadows: {
    soft: "0 20px 80px rgba(4, 8, 16, 0.45)",
    sharp: "0 8px 24px rgba(93, 228, 255, 0.18)",
  },
} as const;

export const motionTokens = {
  spring: {
    type: "spring",
    stiffness: 160,
    damping: 18,
    mass: 0.8,
  },
} as const;
