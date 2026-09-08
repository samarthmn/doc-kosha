import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "DocKosha",
    short_name: "DocKosha",
    description:
      "Secure document sharing and virtual data rooms with privacy‑first analytics.",
    start_url: "/",
    display: "standalone",
    background_color: "#020617",
    theme_color: "#2563eb",
    icons: [
      {
        src: "/icon",
        sizes: "260x260",
        type: "image/png",
      },
    ],
  };
}
