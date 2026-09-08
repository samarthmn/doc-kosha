import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

const TwitterImage = () => {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: 80,
        color: "#ffffff",
        background:
          "radial-gradient(circle at top left, #2563eb 0%, #0b1220 55%, #020617 100%)",
      }}
    >
      <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>
        DocKosha
      </div>
      <div style={{ marginTop: 20, fontSize: 40, fontWeight: 700 }}>
        Secure document sharing & virtual data rooms
      </div>
      <div style={{ marginTop: 18, fontSize: 28, opacity: 0.9 }}>
        Privacy‑first analytics, watermarking, and high‑fidelity viewing.
      </div>
    </div>,
    size,
  );
};

export default TwitterImage;
