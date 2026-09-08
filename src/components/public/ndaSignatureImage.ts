"use client";

export const createTypedNdaSignatureImage = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 200;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#111827";
  ctx.font = "72px 'Brush Script MT', 'Segoe Script', 'Pacifico', cursive";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(trimmed, canvas.width / 2, canvas.height / 2);

  return canvas.toDataURL("image/png");
};
