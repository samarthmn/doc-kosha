"use client";

import React from "react";
import dynamic from "next/dynamic";
import UnsupportedWithDownload from "@/components/documents/renderers/UnsupportedWithDownload";
import ImageViewer from "@/components/documents/renderers/ImageViewer";
import AudioViewer from "@/components/documents/renderers/AudioViewer";
// Removed ODP/ODT support viewers
import { useRenderController } from "@/components/documents/RenderControllerContext";
import type { PublicViewerTrackingHandlers } from "@/hooks/usePublicViewerTracking";
import {
  isAudioExtension,
  isImageExtension,
  isVideoExtension,
} from "@/lib/fileTypes";

// video.js is a large dependency needed only for video documents. A static
// import put its chunk on the critical path of every document view, so one
// failed chunk request (stale deploy, blocked request, flaky network) froze
// non-video documents on the public loading screen too.
const VideoViewer = dynamic(
  () => import("@/components/documents/renderers/VideoViewer"),
  {
    ssr: false,
    loading: () => (
      <div className="mx-auto h-48 w-full max-w-3xl animate-pulse rounded-lg bg-muted" />
    ),
  },
);

// React error boundaries still require a class component. Scoped to the lazy
// media renderer so a failed video.js chunk degrades to the download fallback
// instead of unmounting the whole viewer shell.
class MediaRendererBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): React.ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface DocumentRendererProps {
  fileName: string;
  fileType: string; // extension without dot, lowercase
  src: string; // public URL path
  className?: string;
  allowDownload?: boolean;
  tracking?: PublicViewerTrackingHandlers;
}

const scaleFromZoom = (zoom: number) => Math.max(0.25, Math.min(zoom / 100, 3));

const DocumentRenderer: React.FC<DocumentRendererProps> = ({
  fileName,
  fileType,
  src,
  className,
  allowDownload = true,
  tracking,
}) => {
  const ext = fileType.toLowerCase();
  const { zoom } = useRenderController();
  const scale = scaleFromZoom(zoom);

  // Renderer selection remains layout-neutral; each concrete renderer owns
  // its Nocturne chrome without changing media or download behavior here.
  const DISABLED_PREVIEW_TYPES = new Set([
    "pdf",
    "ppt",
    "pptx",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "xlsm",
    "csv",
    "md",
  ]);

  if (DISABLED_PREVIEW_TYPES.has(ext)) {
    return (
      <UnsupportedWithDownload
        src={src}
        message="Preview is being prepared. Download the original file to view it now."
        className={className}
        allowDownload={allowDownload}
        tracking={tracking}
      />
    );
  }

  if (isImageExtension(ext)) {
    return (
      <ImageViewer
        src={src}
        scale={scale}
        className={className}
        tracking={tracking}
      />
    );
  }

  if (isVideoExtension(ext)) {
    return (
      <MediaRendererBoundary
        fallback={
          <UnsupportedWithDownload
            src={src}
            message="The video player failed to load. Reload the page to try again, or download the original file."
            className={className}
            allowDownload={allowDownload}
            tracking={tracking}
          />
        }
      >
        <VideoViewer
          src={src}
          ext={ext}
          fileName={fileName}
          className={className}
          tracking={tracking}
          allowDownload={allowDownload}
        />
      </MediaRendererBoundary>
    );
  }

  if (isAudioExtension(ext)) {
    return (
      <AudioViewer
        src={src}
        ext={ext}
        fileName={fileName}
        className={className}
        tracking={tracking}
      />
    );
  }

  return (
    <UnsupportedWithDownload
      src={src}
      message={`Preview for .${ext} is not supported. Download to view.`}
      className={className}
      allowDownload={allowDownload}
      tracking={tracking}
    />
  );
};

export default DocumentRenderer;
