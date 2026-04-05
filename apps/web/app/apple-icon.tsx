import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(180deg, #0B1220 0%, #071019 46%, #120E18 100%)",
          borderRadius: 112,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 48,
            left: 48,
            right: 48,
            bottom: 48,
            borderRadius: 92,
            border: "2px solid rgba(255,255,255,0.1)",
          }}
        />
        <div
          style={{
            width: 300,
            height: 300,
            borderRadius: 120,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.45), transparent 34%), linear-gradient(135deg, #5DE4FF 12%, #FF7A6E 88%)",
            boxShadow:
              "0 32px 90px rgba(93,228,255,0.22), inset 0 0 36px rgba(255,255,255,0.25)",
            color: "#071019",
            fontSize: 176,
            fontWeight: 800,
            letterSpacing: "-0.12em",
          }}
        >
          S
        </div>
      </div>
    ),
    size,
  );
}
