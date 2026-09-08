"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";

const ARCADE_ORIGIN = "https://demo.arcade.software";
const ARCADE_MODAL_SRC =
  "https://demo.arcade.software/PDKKBxVkqa80jBrPjdCS?embed&embed_mobile=modal&embed_desktop=modal&show_copy_link=true";

type ArcadeDemoContextValue = {
  openDemo: () => void;
};

const ArcadeDemoContext = createContext<ArcadeDemoContextValue | null>(null);

/**
 * Hosts a single shared demo iframe for the whole page so multiple trigger
 * buttons don't each load the third-party embed (hidden iframes ignore
 * loading="lazy"). The iframe is created lazily on the first trigger click.
 * Wrap the page content once; render `ArcadeProductDemo` for each trigger.
 */
export const ArcadeProductDemoProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const arcadeIframeRef = useRef<HTMLIFrameElement | null>(null);
  const isInitializedRef = useRef(false);
  const pendingOpenRef = useRef(false);
  const [isIframeMounted, setIsIframeMounted] = useState(false);

  useEffect(() => {
    if (!isIframeMounted) return;

    function onArcadeIframeMessage(e: MessageEvent) {
      if (e.origin !== ARCADE_ORIGIN || !e.isTrusted) return;

      const arcadeIframe = arcadeIframeRef.current;
      if (!arcadeIframe || !arcadeIframe.contentWindow) return;
      // Only react to messages from our own iframe.
      if (e.source !== arcadeIframe.contentWindow) return;

      const data =
        typeof e.data === "object" && e.data !== null
          ? (e.data as { event?: string })
          : null;
      const event = data?.event;

      if (event === "arcade-init") {
        isInitializedRef.current = true;
        arcadeIframe.contentWindow.postMessage(
          { event: "register-popout-handler" },
          "*",
        );
        if (pendingOpenRef.current) {
          pendingOpenRef.current = false;
          arcadeIframe.contentWindow.postMessage(
            { event: "request-popout-open" },
            "*",
          );
        }
      }

      if (event === "arcade-popout-open") {
        arcadeIframe.style.height = "100%";
        arcadeIframe.style.zIndex = "9999999";
      }

      if (event === "arcade-popout-close") {
        arcadeIframe.style.height = "0";
        arcadeIframe.style.zIndex = "auto";
      }
    }

    window.addEventListener("message", onArcadeIframeMessage);

    const arcadeIframe = arcadeIframeRef.current;
    if (arcadeIframe && arcadeIframe.contentWindow) {
      arcadeIframe.contentWindow.postMessage(
        { event: "register-popout-handler" },
        "*",
      );
    }

    return () => {
      if (arcadeIframe && arcadeIframe.contentWindow) {
        arcadeIframe.contentWindow.postMessage(
          { event: "unregister-popout-handler" },
          "*",
        );
      }

      window.removeEventListener("message", onArcadeIframeMessage);
    };
  }, [isIframeMounted]);

  const openDemo = useCallback(() => {
    const arcadeIframe = arcadeIframeRef.current;
    if (
      arcadeIframe &&
      arcadeIframe.contentWindow &&
      isInitializedRef.current
    ) {
      arcadeIframe.contentWindow.postMessage(
        { event: "request-popout-open" },
        "*",
      );
      return;
    }
    // Not loaded yet: mount the iframe and open once it reports arcade-init.
    pendingOpenRef.current = true;
    setIsIframeMounted(true);
  }, []);

  const contextValue = useMemo(() => ({ openDemo }), [openDemo]);

  return (
    <ArcadeDemoContext.Provider value={contextValue}>
      {children}
      {isIframeMounted ? (
        <iframe
          ref={arcadeIframeRef}
          src={ARCADE_MODAL_SRC}
          title="DocKosha interactive demo"
          frameBorder="0"
          allowFullScreen
          allow="clipboard-write"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100%",
            height: 0,
            colorScheme: "light",
          }}
        />
      ) : null}
    </ArcadeDemoContext.Provider>
  );
};

interface ArcadeProductDemoProps {
  triggerLabel?: string;
  className?: string;
  buttonClassName?: string;
  buttonVariant?: VariantProps<typeof buttonVariants>["variant"];
  onTriggerClick?: () => void;
}

export const ArcadeProductDemo: React.FC<ArcadeProductDemoProps> = ({
  triggerLabel = "Watch interactive demo",
  className,
  buttonClassName,
  buttonVariant,
  onTriggerClick,
}) => {
  // Requires an ArcadeProductDemoProvider ancestor to host the shared iframe.
  const demoContext = useContext(ArcadeDemoContext);

  function onClickArcadeTrigger() {
    onTriggerClick?.();
    demoContext?.openDemo();
  }

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <Button
        onClick={onClickArcadeTrigger}
        size="lg"
        variant={buttonVariant}
        className={buttonClassName}
      >
        {triggerLabel}
      </Button>
    </div>
  );
};
