"use client";

import { useCallback, useEffect, useRef } from "react";
import type { PdfTextLayerReadyEvent } from "@/components/documents/pdf/engine/MozillaPdfViewer";
import { rectsToAreas } from "@/components/documents/pdf/geometry/pageAreas";
import {
  buildTextLayerSelection,
  type TextLayerSelection,
} from "@/components/documents/pdf/selection/textLayerSelectionGeometry";

type UseTextLayerSelectionArgs = {
  enabled: boolean;
  onSelection: (selection: TextLayerSelection) => void;
  onSelectionStart?: () => void;
  onError?: (error: unknown) => void;
};

type UseTextLayerSelectionResult = {
  clear: () => void;
  onTextLayerReady: (event: PdfTextLayerReadyEvent) => void;
  setPageRotation: (pageIndex: number, rotation: number) => void;
};

const SELECTION_CHANGE_DEBOUNCE_MS = 120;

export const useTextLayerSelection = ({
  enabled,
  onSelection,
  onSelectionStart,
  onError,
}: UseTextLayerSelectionArgs): UseTextLayerSelectionResult => {
  const enabledRef = useRef(enabled);
  const onSelectionRef = useRef(onSelection);
  const onSelectionStartRef = useRef(onSelectionStart);
  const onErrorRef = useRef(onError);
  const textLayersRef = useRef<Map<number, HTMLDivElement>>(new Map());
  const pageRotationsRef = useRef<Map<number, number>>(new Map());
  const selectionChangeTimerRef = useRef<number | null>(null);

  enabledRef.current = enabled;
  onSelectionRef.current = onSelection;
  onSelectionStartRef.current = onSelectionStart;
  onErrorRef.current = onError;

  const cancelSelectionChangeTimer = useCallback((): void => {
    if (selectionChangeTimerRef.current === null) return;
    window.clearTimeout(selectionChangeTimerRef.current);
    selectionChangeTimerRef.current = null;
  }, []);

  const clear = useCallback((): void => {
    cancelSelectionChangeTimer();
    window.getSelection()?.removeAllRanges();
  }, [cancelSelectionChangeTimer]);

  const captureSelection = useCallback((): void => {
    if (!enabledRef.current) return;

    try {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const selectedText = selection.toString();
      if (!selectedText.trim()) return;

      const range = selection.getRangeAt(0);
      const clientRects = Array.from(range.getClientRects());
      const pageBoxes = Array.from(textLayersRef.current.entries()).map(
        ([pageIndex, element]) => ({
          pageIndex,
          rect: element.getBoundingClientRect(),
        }),
      );
      const screenAreas = rectsToAreas({ clientRects, pageBoxes });
      const result = buildTextLayerSelection({
        screenAreas,
        selectedText,
        pageRotations: pageRotationsRef.current,
      });
      if (result) onSelectionRef.current(result);
    } catch (error) {
      onErrorRef.current?.(error);
    }
  }, []);

  const handleMouseDown = useCallback((): void => {
    if (!enabledRef.current) return;
    cancelSelectionChangeTimer();
    onSelectionStartRef.current?.();
  }, [cancelSelectionChangeTimer]);

  const handleMouseUp = useCallback((): void => {
    cancelSelectionChangeTimer();
    captureSelection();
  }, [cancelSelectionChangeTimer, captureSelection]);

  const selectionTouchesRegisteredLayer = useCallback((): boolean => {
    const selection = window.getSelection();
    if (!selection?.anchorNode || !selection.focusNode) return false;
    return Array.from(textLayersRef.current.values()).some(
      (element) =>
        element.contains(selection.anchorNode) ||
        element.contains(selection.focusNode),
    );
  }, []);

  useEffect(() => {
    // Never disable native text selection. This hook only CAPTURES selections
    // for comment anchoring; when capture is inactive the text layer must stay
    // selectable, because reading and copying text is baseline viewer
    // behavior for every visitor, comments open or not.
    if (!enabled) {
      clear();
      return;
    }

    const handleSelectionChange = (): void => {
      cancelSelectionChangeTimer();
      if (!selectionTouchesRegisteredLayer()) return;
      selectionChangeTimerRef.current = window.setTimeout(() => {
        selectionChangeTimerRef.current = null;
        captureSelection();
      }, SELECTION_CHANGE_DEBOUNCE_MS);
    };
    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      cancelSelectionChangeTimer();
    };
  }, [
    cancelSelectionChangeTimer,
    captureSelection,
    clear,
    enabled,
    selectionTouchesRegisteredLayer,
  ]);

  const onTextLayerReady = useCallback(
    (event: PdfTextLayerReadyEvent): void => {
      const { element, pageIndex, phase } = event;
      const existing = textLayersRef.current.get(pageIndex);
      if (phase === "detach") {
        if (existing !== element) return;
        element.removeEventListener("mousedown", handleMouseDown);
        element.removeEventListener("mouseup", handleMouseUp);
        element.style.userSelect = "";
        textLayersRef.current.delete(pageIndex);
        return;
      }

      if (existing && existing !== element) {
        existing.removeEventListener("mousedown", handleMouseDown);
        existing.removeEventListener("mouseup", handleMouseUp);
      }
      textLayersRef.current.set(pageIndex, element);
      element.addEventListener("mousedown", handleMouseDown);
      element.addEventListener("mouseup", handleMouseUp);
    },
    [handleMouseDown, handleMouseUp],
  );

  const setPageRotation = useCallback(
    (pageIndex: number, rotation: number): void => {
      pageRotationsRef.current.set(pageIndex, rotation);
    },
    [],
  );

  useEffect(
    () => () => {
      cancelSelectionChangeTimer();
      for (const element of textLayersRef.current.values()) {
        element.removeEventListener("mousedown", handleMouseDown);
        element.removeEventListener("mouseup", handleMouseUp);
        element.style.userSelect = "";
      }
      textLayersRef.current.clear();
      pageRotationsRef.current.clear();
    },
    [cancelSelectionChangeTimer, handleMouseDown, handleMouseUp],
  );

  return { clear, onTextLayerReady, setPageRotation };
};
