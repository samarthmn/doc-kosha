"use client";

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SignaturePoint = {
  x: number;
  y: number;
};

export type NdaSignatureCanvasHandle = {
  exportDataUrl: () => string | null;
  clear: () => void;
  hasInk: () => boolean;
};

type NdaSignatureCanvasProps = {
  ariaLabel: string;
  clearLabel: string;
  className?: string;
  height?: number;
  onBegin?: () => void;
  onChange?: (dataUrl: string | null) => void;
};

const STROKE_COLOR = "#000000";
const STROKE_WIDTH = 3;
const MAX_EXPORT_RATIO = 2;

const drawStroke = (
  ctx: CanvasRenderingContext2D,
  stroke: SignaturePoint[],
): void => {
  if (stroke.length === 0) return;

  ctx.strokeStyle = STROKE_COLOR;
  ctx.fillStyle = STROKE_COLOR;
  ctx.lineWidth = STROKE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (stroke.length === 1) {
    const point = stroke[0];
    ctx.beginPath();
    ctx.arc(point.x, point.y, STROKE_WIDTH / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  ctx.beginPath();
  ctx.moveTo(stroke[0].x, stroke[0].y);
  for (const point of stroke.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
};

const drawStrokes = (
  canvas: HTMLCanvasElement,
  strokes: SignaturePoint[][],
  options: { includeBackground: boolean; ratio: number },
): void => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.setTransform(options.ratio, 0, 0, options.ratio, 0, 0);
  ctx.clearRect(
    0,
    0,
    canvas.width / options.ratio,
    canvas.height / options.ratio,
  );

  if (options.includeBackground) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(
      0,
      0,
      canvas.width / options.ratio,
      canvas.height / options.ratio,
    );
  }

  for (const stroke of strokes) {
    drawStroke(ctx, stroke);
  }
};

const getRenderableStrokes = (
  committedStrokes: SignaturePoint[][],
  activeStroke: SignaturePoint[] | null,
): SignaturePoint[][] => {
  if (!activeStroke || activeStroke.length === 0) {
    return committedStrokes;
  }
  return [...committedStrokes, activeStroke];
};

const getCanvasPoint = (
  event: React.PointerEvent<HTMLCanvasElement>,
): SignaturePoint => {
  const rect = event.currentTarget.getBoundingClientRect();
  const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  return {
    x: clamp(event.clientX - rect.left, 0, rect.width),
    y: clamp(event.clientY - rect.top, 0, rect.height),
  };
};

const NdaSignatureCanvas = forwardRef<
  NdaSignatureCanvasHandle,
  NdaSignatureCanvasProps
>(
  (
    { ariaLabel, clearLabel, className, height = 180, onBegin, onChange },
    ref,
  ) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const strokesRef = useRef<SignaturePoint[][]>([]);
    const activePointerIdRef = useRef<number | null>(null);
    const activeStrokeRef = useRef<SignaturePoint[] | null>(null);
    const sizeRef = useRef<{ width: number; height: number }>({
      width: 1,
      height,
    });
    const [hasInk, setHasInk] = useState<boolean>(false);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      drawStrokes(
        canvas,
        getRenderableStrokes(strokesRef.current, activeStrokeRef.current),
        {
          includeBackground: true,
          ratio,
        },
      );
    }, []);

    const exportDataUrl = useCallback((): string | null => {
      const strokes = getRenderableStrokes(
        strokesRef.current,
        activeStrokeRef.current,
      );
      if (strokes.length === 0) return null;

      const { width, height: canvasHeight } = sizeRef.current;
      const ratio = Math.min(
        Math.max(window.devicePixelRatio || 1, 1),
        MAX_EXPORT_RATIO,
      );
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = Math.max(1, Math.round(width * ratio));
      exportCanvas.height = Math.max(1, Math.round(canvasHeight * ratio));
      drawStrokes(exportCanvas, strokes, {
        includeBackground: true,
        ratio,
      });
      return exportCanvas.toDataURL("image/png");
    }, []);

    const clear = useCallback(() => {
      strokesRef.current = [];
      activeStrokeRef.current = null;
      activePointerIdRef.current = null;
      setHasInk(false);
      redraw();
      onChange?.(null);
    }, [onChange, redraw]);

    useImperativeHandle(
      ref,
      () => ({
        exportDataUrl,
        clear,
        hasInk: () =>
          getRenderableStrokes(strokesRef.current, activeStrokeRef.current)
            .length > 0,
      }),
      [clear, exportDataUrl],
    );

    const commitStroke = useCallback(() => {
      const stroke = activeStrokeRef.current;
      activeStrokeRef.current = null;
      activePointerIdRef.current = null;

      if (!stroke || stroke.length === 0) return;
      strokesRef.current = [...strokesRef.current, stroke];
      setHasInk(true);
      redraw();
      onChange?.(exportDataUrl());
    }, [exportDataUrl, onChange, redraw]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const resizeCanvas = () => {
        const rect = canvas.getBoundingClientRect();
        const width = Math.max(1, rect.width);
        const canvasHeight = Math.max(1, rect.height || height);
        const ratio = Math.max(window.devicePixelRatio || 1, 1);

        sizeRef.current = { width, height: canvasHeight };
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(canvasHeight * ratio);
        redraw();
      };

      resizeCanvas();

      if (typeof ResizeObserver === "undefined") {
        window.addEventListener("resize", resizeCanvas);
        return () => window.removeEventListener("resize", resizeCanvas);
      }

      const observer = new ResizeObserver(resizeCanvas);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [height, redraw]);

    const handlePointerDown = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ): void => {
      if (activePointerIdRef.current !== null) return;
      event.preventDefault();
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      onBegin?.();
      activePointerIdRef.current = event.pointerId;
      activeStrokeRef.current = [getCanvasPoint(event)];
      setHasInk(true);
      redraw();
      const canvas = canvasRef.current;
      if (!canvas || !activeStrokeRef.current) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawStroke(ctx, activeStrokeRef.current);
      onChange?.(exportDataUrl());
    };

    const handlePointerMove = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ): void => {
      if (activePointerIdRef.current !== event.pointerId) return;
      const stroke = activeStrokeRef.current;
      if (!stroke) return;
      event.preventDefault();
      stroke.push(getCanvasPoint(event));

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawStroke(ctx, stroke);
    };

    const handlePointerUp = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ): void => {
      if (activePointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      commitStroke();
    };

    const handlePointerCancel = (
      event: React.PointerEvent<HTMLCanvasElement>,
    ): void => {
      if (activePointerIdRef.current !== event.pointerId) return;
      event.preventDefault();
      activeStrokeRef.current = null;
      activePointerIdRef.current = null;
      setHasInk(strokesRef.current.length > 0);
      redraw();
      onChange?.(exportDataUrl());
    };

    return (
      <div className={cn("space-y-2", className)}>
        <div className="rounded-md border border-border/60 bg-white">
          <canvas
            ref={canvasRef}
            aria-label={ariaLabel}
            className="block w-full cursor-crosshair bg-white"
            style={{ height, touchAction: "none" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={clear}
            disabled={!hasInk}
          >
            {clearLabel}
          </Button>
        </div>
      </div>
    );
  },
);

NdaSignatureCanvas.displayName = "NdaSignatureCanvas";

export default NdaSignatureCanvas;
