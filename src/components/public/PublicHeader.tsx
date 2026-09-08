import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChatCircle,
  ChatTeardropText,
  CircleNotch,
  DownloadSimple,
  Globe,
  Question,
  SealCheck,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";

interface PublicHeaderProps {
  title?: string;
  backToRoomHref?: string | null;
  branding?: {
    companyName?: string | null;
    websiteUrl?: string | null;
    logoUrl?: string | null;
    domain?: string | null;
    domainVerified?: boolean;
    showPoweredBy?: boolean;
  } | null;
  actions?: {
    showFeedback?: boolean;
    showQnA?: boolean;
    showComments?: boolean;
    commentsOpen?: boolean;
    onToggleComments?: () => void;
    canDownload?: boolean;
    downloading?: boolean;
    onDownload?: () => void;
    onFeedbackSubmit?: (text: string) => Promise<void>;
    curatedQas?: Array<{ question: string; answer: string }>;
  };
  className?: string;
  labels?: {
    sharedViaDocKosha: string;
    feedback: string;
    giveFeedback: string;
    feedbackPlaceholder: string;
    submitFeedback: string;
    comments: string;
    hideComments: string;
    showComments: string;
    qAndA: string;
    frequentlyAskedQuestions: string;
    download: string;
    verifiedWorkspace: string;
    backToDataRoom: string;
    poweredByDocKosha?: string;
  };
}

const PublicHeader: React.FC<PublicHeaderProps> = ({
  title,
  backToRoomHref,
  branding,
  actions,
  className,
  labels,
}) => {
  const router = useRouter();
  const [feedbackOpen, setFeedbackOpen] = React.useState(false);
  const [qaOpen, setQaOpen] = React.useState(false);
  const [feedbackText, setFeedbackText] = React.useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = React.useState(false);
  const [feedbackError, setFeedbackError] = React.useState<string | null>(null);

  const hasBranding = Boolean(
    branding?.companyName || branding?.logoUrl || branding?.websiteUrl,
  );
  const poweredByLabel = labels?.poweredByDocKosha ?? "Powered by DocKosha";

  return (
    <div
      translate="no"
      className={cn(
        "notranslate sticky top-0 z-30 w-full border-b border-border/70 bg-background/90 backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex min-h-14 w-full max-w-6xl items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2 overflow-hidden sm:gap-3">
          {backToRoomHref && (
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-md border border-transparent text-muted-foreground hover:border-border/70 hover:bg-foreground/5 hover:text-foreground"
              onClick={() => router.push(backToRoomHref)}
              aria-label={labels?.backToDataRoom ?? "Back to data room"}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Button>
          )}

          {hasBranding ? (
            <div className="flex min-w-0 items-center gap-2.5 overflow-hidden sm:gap-3">
              <h1 className="sr-only">{title || "Document Viewer"}</h1>
              {branding?.logoUrl && (
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-card/70 p-0.5 shadow-sm">
                  <img
                    src={branding.logoUrl}
                    alt={branding.companyName || "Logo"}
                    className="h-full w-full object-contain"
                  />
                </div>
              )}

              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-2">
                  {branding?.companyName && (
                    <span className="truncate text-[13px] leading-tight font-medium tracking-[-0.01em] sm:text-sm">
                      {branding.companyName}
                    </span>
                  )}
                  {branding?.domainVerified && (
                    <div className="hidden items-center gap-1 rounded border border-primary/25 bg-primary/8 px-1.5 py-0.5 text-[10px] font-medium text-primary sm:flex">
                      <SealCheck className="h-3 w-3" aria-hidden />
                      <span>
                        {labels?.verifiedWorkspace ?? "Verified workspace"}
                      </span>
                    </div>
                  )}
                </div>

                {branding?.domain && (
                  <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex">
                    <Globe className="h-3 w-3 opacity-70" aria-hidden />
                    <span className="opacity-90">{branding.domain}</span>
                  </div>
                )}

                {branding?.showPoweredBy ? (
                  <span className="text-[11px] font-medium tracking-[0.02em] text-muted-foreground">
                    {poweredByLabel}
                  </span>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex flex-col">
              <span className="text-[11px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                {branding?.showPoweredBy
                  ? poweredByLabel
                  : (labels?.sharedViaDocKosha ?? "Shared via DocKosha")}
              </span>
              <h1 className="max-w-[42vw] truncate text-[13px] font-medium tracking-[-0.01em] sm:max-w-sm sm:text-sm">
                {title || "Document Viewer"}
              </h1>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {actions?.showFeedback && actions.onFeedbackSubmit && (
            <Dialog
              open={feedbackOpen}
              onOpenChange={(open) => {
                setFeedbackOpen(open);
                if (!open) setFeedbackError(null);
              }}
            >
              <DialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={labels?.feedback ?? "Feedback"}
                  className="h-9 w-9 gap-1.5 rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground md:h-8 md:w-auto md:px-2.5 md:text-xs"
                >
                  <ChatTeardropText className="h-4 w-4" aria-hidden />
                  <span className="hidden md:inline">
                    {labels?.feedback ?? "Feedback"}
                  </span>
                </Button>
              </DialogTrigger>
              <DialogContent
                className="ph-no-capture dk-nocturne-overlay rounded-[14px]"
                data-ph-no-capture
              >
                <DialogHeader>
                  <DialogTitle>
                    {labels?.giveFeedback ?? "Give Feedback"}
                  </DialogTitle>
                </DialogHeader>
                <Textarea
                  placeholder={
                    labels?.feedbackPlaceholder ?? "Share your thoughts..."
                  }
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  className="min-h-30 resize-none"
                />
                {feedbackError && (
                  <p className="text-sm text-destructive" role="alert">
                    {feedbackError}
                  </p>
                )}
                <DialogFooter>
                  <Button
                    disabled={!feedbackText.trim() || feedbackSubmitting}
                    onClick={async () => {
                      setFeedbackSubmitting(true);
                      setFeedbackError(null);
                      try {
                        await actions.onFeedbackSubmit?.(feedbackText);
                        setFeedbackText("");
                        setFeedbackOpen(false);
                      } catch {
                        setFeedbackError(
                          "We couldn't submit your feedback. Please try again.",
                        );
                      } finally {
                        setFeedbackSubmitting(false);
                      }
                    }}
                  >
                    {feedbackSubmitting && (
                      <CircleNotch
                        className="h-4 w-4 animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                    )}
                    {labels?.submitFeedback ?? "Submit Feedback"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}

          {actions?.showComments && actions.onToggleComments && (
            <div className="flex min-h-9 items-center gap-2 rounded-md px-1.5 hover:bg-foreground/5">
              <ChatCircle
                className={cn(
                  "h-4 w-4",
                  actions.commentsOpen
                    ? "text-foreground"
                    : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span className="hidden text-xs font-medium md:inline">
                {labels?.comments ?? "Comments"}
              </span>
              <Switch
                checked={Boolean(actions.commentsOpen)}
                onCheckedChange={() => actions.onToggleComments?.()}
                aria-label={
                  actions.commentsOpen
                    ? (labels?.hideComments ?? "Hide comments")
                    : (labels?.showComments ?? "Show comments")
                }
              />
            </div>
          )}

          {actions?.showQnA &&
            actions.curatedQas &&
            actions.curatedQas.length > 0 && (
              <Dialog open={qaOpen} onOpenChange={setQaOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={labels?.qAndA ?? "Q&A"}
                    className="h-9 w-9 gap-1.5 rounded-md text-muted-foreground hover:bg-foreground/5 hover:text-foreground md:h-8 md:w-auto md:px-2.5 md:text-xs"
                  >
                    <Question className="h-4 w-4" aria-hidden />
                    <span className="hidden md:inline">
                      {labels?.qAndA ?? "Q&A"}
                    </span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="dk-nocturne-overlay max-w-md rounded-[14px]">
                  <DialogHeader>
                    <DialogTitle>
                      {labels?.frequentlyAskedQuestions ??
                        "Frequently Asked Questions"}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="max-h-[60vh] space-y-4 overflow-y-auto pt-2 pr-2">
                    {actions.curatedQas.map((qa, idx) => (
                      <div
                        key={idx}
                        className="rounded-md border border-transparent px-1 py-1.5"
                      >
                        <p className="font-medium text-foreground">
                          {qa.question}
                        </p>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {qa.answer}
                        </p>
                        {idx < (actions.curatedQas?.length || 0) - 1 && (
                          <Separator className="mt-4" />
                        )}
                      </div>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            )}

          {(actions?.showFeedback ||
            actions?.showQnA ||
            actions?.showComments) &&
            actions?.canDownload && (
              <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
            )}

          {actions?.canDownload && (
            <Button
              variant="default"
              size="sm"
              className="h-9 gap-1.5 rounded-md border border-primary bg-transparent px-2.5 text-xs text-primary shadow-none hover:bg-primary/10 hover:text-primary"
              onClick={actions.onDownload}
              disabled={actions.downloading}
              aria-label={labels?.download ?? "Download"}
            >
              {actions.downloading ? (
                <CircleNotch
                  className="h-4 w-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : (
                <DownloadSimple className="h-4 w-4" aria-hidden />
              )}
              <span className="hidden sm:inline">
                {labels?.download ?? "Download"}
              </span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};

export { PublicHeader };
