import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "54px 64px",
          background:
            "radial-gradient(circle at 18% 20%, rgba(93,228,255,0.28), transparent 28%), radial-gradient(circle at 82% 24%, rgba(255,122,110,0.2), transparent 24%), linear-gradient(160deg, #070B12 4%, #0B1320 42%, #140D17 100%)",
          color: "white",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 24,
            borderRadius: 36,
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 20,
            }}
          >
            <div
              style={{
                width: 94,
                height: 94,
                borderRadius: 28,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background:
                  "linear-gradient(135deg, rgba(93,228,255,0.95), rgba(255,122,110,0.9))",
                color: "#071019",
                fontSize: 56,
                fontWeight: 800,
              }}
            >
              S
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div
                style={{
                  fontSize: 28,
                  letterSpacing: "0.24em",
                  textTransform: "uppercase",
                  color: "rgba(255,255,255,0.58)",
                }}
              >
                Synq
              </div>
              <div
                style={{
                  fontSize: 76,
                  fontWeight: 800,
                  lineHeight: 1,
                }}
              >
                Ghost mode for real conversations
              </div>
            </div>
          </div>
          <div
            style={{
              borderRadius: 999,
              border: "1px solid rgba(93,228,255,0.28)",
              padding: "12px 18px",
              color: "#D8FBFF",
              fontSize: 20,
            }}
          >
            Private cinematic messenger
          </div>
        </div>
        <div style={{ display: "flex", gap: 18 }}>
          {[
            "Create and join rooms instantly",
            "Find friends by handle",
            "Replies, reactions, pins, and voice notes",
            "Hidden avatar and private discovery controls",
          ].map((item) => (
            <div
              key={item}
              style={{
                flex: 1,
                borderRadius: 28,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.04)",
                padding: "24px 26px",
                fontSize: 24,
                lineHeight: 1.35,
                color: "rgba(255,255,255,0.82)",
              }}
            >
              {item}
            </div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
