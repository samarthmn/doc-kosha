"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface RenderControllerState {
  page: number;
  zoom: number; // percent (100 = normal)
  totalPages: number;
  setPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setTotalPages: (n: number) => void;
}

const RenderControllerContext = createContext<RenderControllerState | null>(
  null,
);

export const useRenderController = (): RenderControllerState => {
  const ctx = useContext(RenderControllerContext);
  if (!ctx)
    throw new Error(
      "useRenderController must be used within RenderControllerProvider",
    );
  return ctx;
};

interface RenderControllerProviderProps {
  children: React.ReactNode;
}

export const RenderControllerProvider: React.FC<
  RenderControllerProviderProps
> = ({ children }) => {
  const [page, setPage] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(100);
  const [totalPages, setTotalPages] = useState<number>(1);

  const setPageClamped = useCallback(
    (p: number) => {
      setPage(() => {
        const next = Math.max(1, Math.min(p, totalPages || 1));
        return next;
      });
    },
    [totalPages],
  );

  const setZoomClamped = useCallback((z: number) => {
    const clamped = Math.max(25, Math.min(z, 300));
    setZoom(clamped);
  }, []);

  const value = useMemo<RenderControllerState>(
    () => ({
      page,
      zoom,
      totalPages,
      setPage: setPageClamped,
      setZoom: setZoomClamped,
      setTotalPages,
    }),
    [page, zoom, totalPages, setPageClamped, setZoomClamped],
  );

  return (
    <RenderControllerContext.Provider value={value}>
      {children}
    </RenderControllerContext.Provider>
  );
};
