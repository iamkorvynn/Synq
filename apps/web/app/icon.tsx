import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
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
            "radial-gradient(circle at 30% 20%, #5DE4FF 0, rgba(93,228,255,0.12) 28%, transparent 48%), linear-gradient(145deg, #070B12 8%, #0F1722 48%, #180F1A 100%)",
          borderRadius: 96,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 28,
            borderRadius: 88,
            border: "2px solid rgba(255,255,255,0.12)",
            boxShadow: "inset 0 0 100px rgba(255,255,255,0.06)",
          }}
        />
        <div
          style={{
            width: 272,
            height: 272,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              "linear-gradient(135deg, rgba(93,228,255,0.95), rgba(255,122,110,0.88))",
            boxShadow:
              "0 32px 80px rgba(93,228,255,0.28), inset 0 0 30px rgba(255,255,255,0.32)",
            color: "#071019",
            fontSize: 168,
            fontWeight: 800,
            letterSpacing: "-0.12em",
            transform: "rotate(-8deg)",
          }}
        >
          S
        </div>
      </div>
    ),
    size,
  );
}
