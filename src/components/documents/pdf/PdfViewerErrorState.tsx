"use client";

import React, { useEffect } from "react";
import type { PdfLoadFailure } from "@/components/documents/pdf/PdfLoadErrorView";

type PdfViewerErrorStateProps = {
  error: PdfLoadFailure;
  onError: () => void;
  renderError: (error: PdfLoadFailure) => React.ReactElement;
};

export const PdfViewerErrorState: React.FC<PdfViewerErrorStateProps> = ({
  error,
  onError,
  renderError,
}) => {
  useEffect(() => {
    onError();
  }, [onError]);

  return renderError(error);
};
