"use client";

import React from "react";
import { cn } from "@/lib/utils";
import type { WatermarkOverlayModel } from "@/lib/watermark";

const clamp = (
  value: number,
  min: number,
  max: number,
  fallback: number,
): number => {
  if (!Number.isFinite(value)) return fallback;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

// PDF points are 1/72 inch and CSS pixels are 1/96 inch. This factor is
// deliberate: changing it desynchronizes the preview from pdf-lib/DocYantra.
const PT_TO_CSS_PX = 96 / 72;
const MAX_STAMPS_PER_PAGE = 500;

type WatermarkStamp = {
  x: number;
  y: number;
};

type CalculateWatermarkPageLayoutArgs = {
  model: WatermarkOverlayModel;
  width: number;
  height: number;
  scale: number;
};

type WatermarkPageLayout = {
  fontSizePt: number;
  fontSizePx: number;
  metaFontSizePx: number;
  pxPerPt: number;
  safeXSpacingPx: number;
  safeYSpacingPx: number;
  imageWidthPx: number;
  imageHeightPx: number;
  hybridGapPx: number;
  rotationDeg: number;
  stamps: WatermarkStamp[];
};

export const calculateWatermarkPageLayout = ({
  model,
  width,
  height,
  scale,
}: CalculateWatermarkPageLayoutArgs): WatermarkPageLayout => {
  const fontSizePt = clamp(model.style.fontSizeRem * 12, 8, 64, 14);
  const metaFontSizePt = clamp(
    fontSizePt * 0.65,
    6,
    fontSizePt,
    fontSizePt * 0.65,
  );
  const pxPerPt = scale * PT_TO_CSS_PX;
  const fontSizePx = fontSizePt * pxPerPt;
  const metaFontSizePx = metaFontSizePt * pxPerPt;
  const xSpacingPx = model.layout.xSpacingPt * pxPerPt;
  const ySpacingPx = model.layout.ySpacingPt * pxPerPt;
  const safeXSpacingPx = Math.max(24, xSpacingPx);
  const safeYSpacingPx = Math.max(24, ySpacingPx);
  // CSS rotate() is clockwise-positive, whereas PDF rotation is CCW-positive.
  // Invert to match the downloaded PDF watermark output.
  const rotationDeg = -model.layout.rotationDeg;

  const imageWidthPt =
    model.layout.mode === "image" || model.layout.mode === "hybrid"
      ? model.layout.imageWidthPt
      : undefined;
  const imageHeightPt =
    model.layout.mode === "image" || model.layout.mode === "hybrid"
      ? model.layout.imageHeightPt
      : undefined;
  const imageWidthPx =
    typeof imageWidthPt === "number" ? imageWidthPt * pxPerPt : 0;
  const imageHeightPx =
    typeof imageHeightPt === "number" ? imageHeightPt * pxPerPt : 0;
  const hybridGapPx = fontSizePt * 0.6 * pxPerPt;

  const stamps: WatermarkStamp[] = [];
  if (model.layout.pattern === "single") {
    stamps.push({ x: width / 2, y: height / 2 });
  } else {
    const startX = -width;
    const endX = width * 2;
    const startY = -height;
    const endY = height * 2;

    for (let x = startX; x <= endX; x += safeXSpacingPx) {
      for (let y = startY; y <= endY; y += safeYSpacingPx) {
        stamps.push({ x, y });
        if (stamps.length >= MAX_STAMPS_PER_PAGE) break;
      }
      if (stamps.length >= MAX_STAMPS_PER_PAGE) break;
    }
  }

  return {
    fontSizePt,
    fontSizePx,
    metaFontSizePx,
    pxPerPt,
    safeXSpacingPx,
    safeYSpacingPx,
    imageWidthPx,
    imageHeightPx,
    hybridGapPx,
    rotationDeg,
    stamps,
  };
};

type WatermarkPageOverlayProps = {
  model: WatermarkOverlayModel;
  width: number;
  height: number;
  scale: number;
};

export const WatermarkPageOverlay: React.FC<WatermarkPageOverlayProps> = ({
  model,
  width,
  height,
  scale,
}) => {
  const layout = calculateWatermarkPageLayout({
    model,
    width,
    height,
    scale,
  });
  const mode = model.layout.mode;
  const resolvedImageUrl = model.layout.imageUrl ?? null;

  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{
        height: `${height}px`,
        width: `${width}px`,
        // React-PDF renders Page children after its text/annotation layers.
        // z-index 0 keeps this over the canvas but below their positive layers.
        zIndex: 0,
      }}
    >
      <div className="branding-watermark-overlay">
        {layout.stamps.map((stamp, stampIndex) => (
          <div
            key={`${stampIndex}-${stamp.x}-${stamp.y}`}
            style={{
              position: "absolute",
              left: `${stamp.x}px`,
              top: `${stamp.y}px`,
              transform: "translate(-50%, -50%)",
            }}
          >
            <div
              style={{
                transform: `rotate(${layout.rotationDeg}deg)`,
                transformOrigin: "center",
                opacity: model.style.opacity,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                gap:
                  mode === "hybrid" && resolvedImageUrl
                    ? `${layout.hybridGapPx}px`
                    : "0px",
              }}
            >
              {(mode === "image" || mode === "hybrid") && resolvedImageUrl ? (
                <img
                  src={resolvedImageUrl}
                  alt=""
                  aria-hidden
                  style={{
                    width: layout.imageWidthPx
                      ? `${layout.imageWidthPx}px`
                      : undefined,
                    height: layout.imageHeightPx
                      ? `${layout.imageHeightPx}px`
                      : undefined,
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              ) : null}

              {mode === "text" || mode === "hybrid" ? (
                <div
                  style={{
                    color: model.style.color,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                  }}
                >
                  {model.lines.map((line, index) => {
                    const isPrimary = line.kind === "primary";
                    const sizePx = isPrimary
                      ? layout.fontSizePx
                      : layout.metaFontSizePx;
                    const gapBeforePx =
                      index === 0
                        ? 0
                        : index === 1
                          ? sizePx * 0.35
                          : sizePx * 0.18;

                    return (
                      <span
                        key={`${line.kind}-${index}`}
                        className={cn(
                          "branding-watermark-overlay__line",
                          isPrimary
                            ? "branding-watermark-overlay__line--primary"
                            : "branding-watermark-overlay__line--meta",
                        )}
                        style={{
                          fontSize: `${sizePx}px`,
                          marginTop: gapBeforePx
                            ? `${gapBeforePx}px`
                            : undefined,
                          lineHeight: 1.2,
                          // Preserve typed casing (do not force uppercasing via CSS).
                          textTransform: "none",
                        }}
                      >
                        {line.text}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
