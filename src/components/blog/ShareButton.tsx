"use client";

import React from "react";
import { Check, ShareNetwork } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";

interface ShareButtonProps {
  title: string;
  url: string; // We can pass the full URL or construct it
  description?: string;
  className?: string; // Allow passing standard props like className
}

const ShareButton: React.FC<ShareButtonProps> = ({
  title,
  url,
  description,
  className,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleShare = async () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({
          title,
          text: description,
          url,
        });
        // Optional: toast.success("Shared successfully!");
      } catch (error) {
        // user cancelled or error, fall back if needed or just ignore
        if ((error as Error).name !== "AbortError") {
          console.error("Error sharing:", error);
        }
      }
    } else {
      // Fallback: Copy to clipboard
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success("Link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
        toast.error("Failed to copy link.");
      }
    }
  };

  return (
    <Button
      variant="outline"
      size="lg"
      className={`gap-2 ${className || ""}`}
      onClick={handleShare}
    >
      {copied ? (
        <Check aria-hidden className="h-4 w-4" />
      ) : (
        <ShareNetwork aria-hidden className="h-4 w-4" />
      )}
      {copied ? "Copied" : "Share"}
    </Button>
  );
};

export default ShareButton;
