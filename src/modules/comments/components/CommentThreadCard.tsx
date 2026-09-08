"use client";

import React, { useMemo } from "react";
import { CircleNotch, Trash, X } from "@phosphor-icons/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatPublicDate } from "@/modules/public-links/i18n";
import type { PublicLanguage } from "@/modules/public-links/types";

type CommentThreadCardMessage = {
  id: string;
  body: string;
  authorLabel: string;
  authorColor?: string | null;
  createdAt?: string | null;
  isMe?: boolean;
  state?: "active" | "deleted";
};

type CommentThreadCardProps = {
  mode: "composer" | "thread";
  quote: string | null;
  title: string;
  subtitle?: string | null;
  avatarInitial: string;
  avatarColor?: string | null;
  onClose: () => void;

  state?: "open" | "resolved";
  resolvedExpanded?: boolean;
  onResolvedExpandedChange?: (expanded: boolean) => void;

  canToggleResolve?: boolean;
  onToggleResolve?: () => void;
  resolveSubmitting?: boolean;

  messages?: CommentThreadCardMessage[];
  onDeleteMessage?: (messageId: string) => void;

  body: string;
  onBodyChange: (value: string) => void;
  placeholder: string;
  onSubmit: () => void;
  submitLabel: string;
  submitSubmitting?: boolean;
  submitDisabled?: boolean;

  maxChars: number;
  minChars: number;
  language?: PublicLanguage;
  labels?: {
    resolve: string;
    reopen: string;
    closeComments: string;
    resolved: string;
    viewThread: string;
    deleteComment: string;
    deleted: string;
    resolvedDescription: string;
    hideThread: string;
  };
};

export const CommentThreadCard: React.FC<CommentThreadCardProps> = (props) => {
  const messageCount = props.messages?.length ?? 0;

  const normalizedQuote = useMemo(() => {
    if (!props.quote) return null;
    const q = props.quote.replace(/[\r\n\t]+/g, " ").trim();
    return q ? q : null;
  }, [props.quote]);

  const trimmedBody = props.body.trim();
  const bodyTooLong = trimmedBody.length > props.maxChars;
  const bodyTooShort = trimmedBody.length < props.minChars;

  const disableSubmit =
    Boolean(props.submitDisabled) ||
    Boolean(props.submitSubmitting) ||
    bodyTooLong ||
    bodyTooShort;

  const handleSubmitShortcut = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (!(event.key === "Enter" && (event.metaKey || event.ctrlKey))) {
      return;
    }
    if (disableSubmit) {
      return;
    }
    event.preventDefault();
    props.onSubmit();
  };

  const showResolvedCollapsed =
    props.mode === "thread" &&
    props.state === "resolved" &&
    props.resolvedExpanded === false;

  const formatTime = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "—";
    }
    return formatPublicDate(date, props.language, {
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div
      className={cn(
        "dk-nocturne-overlay relative overflow-hidden rounded-lg transition-colors duration-200 motion-reduce:transition-none",
        props.state === "resolved" ? "grayscale-[0.5]" : undefined,
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 top-0 h-px",
          props.state === "resolved" ? "bg-border" : "bg-primary/55",
        )}
        aria-hidden="true"
      />

      <div className="flex items-start justify-between gap-3 border-b border-border/60 p-4">
        <div className="min-w-0 space-y-3">
          {normalizedQuote ? (
            <div className="rounded-r border-l-2 border-l-primary/55 bg-muted/30 py-1.5 pr-3 pl-3">
              <p className="line-clamp-3 text-sm text-pretty text-muted-foreground italic">
                &ldquo;{normalizedQuote}&rdquo;
              </p>
            </div>
          ) : null}

          <div className="flex items-center gap-3">
            <Avatar className="size-9">
              <AvatarFallback
                className="text-sm font-medium"
                style={
                  props.avatarColor
                    ? {
                        // Low-opacity author tint instead of a saturated fill:
                        // solid chart colours cannot carry legible text in all
                        // nine palettes (white on --chart-1 is 2.06:1 in dark),
                        // whereas --foreground over a 22% tint is >= 7.34:1.
                        backgroundColor: `color-mix(in srgb, var(--${props.avatarColor}) 22%, transparent)`,
                        boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--${props.avatarColor}) 55%, transparent)`,
                      }
                    : undefined
                }
              >
                {props.avatarInitial.toUpperCase()}
              </AvatarFallback>
            </Avatar>

            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{props.title}</p>
              {props.subtitle ? (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {props.subtitle}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {props.canToggleResolve ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={props.resolveSubmitting}
              onClick={props.onToggleResolve}
            >
              {props.resolveSubmitting ? (
                <CircleNotch
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden
                />
              ) : null}
              <span>
                {props.state === "open"
                  ? (props.labels?.resolve ?? "Resolve")
                  : (props.labels?.reopen ?? "Reopen")}
              </span>
            </Button>
          ) : null}

          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={props.onClose}
            aria-label={props.labels?.closeComments ?? "Close comments"}
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {props.mode === "thread" ? (
        <div className="p-4">
          {showResolvedCollapsed ? (
            <div className="flex items-center justify-between gap-3 rounded border border-border/60 bg-muted/25 px-3 py-2">
              <p className="text-sm text-muted-foreground">
                {props.labels?.resolved ?? "Resolved"}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => props.onResolvedExpandedChange?.(true)}
              >
                {props.labels?.viewThread ?? "View thread"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {messageCount > 0 ? (
                <div className="space-y-2">
                  {props.messages?.map((message) => (
                    <div
                      key={message.id}
                      className="rounded border border-border/60 bg-background/25 p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {message.authorLabel}
                          </p>
                          {message.createdAt ? (
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {formatTime(message.createdAt)}
                            </p>
                          ) : null}
                        </div>

                        {props.onDeleteMessage &&
                        message.isMe &&
                        message.state !== "deleted" ? (
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="size-8 shrink-0"
                            onClick={() => props.onDeleteMessage?.(message.id)}
                            aria-label={
                              props.labels?.deleteComment ?? "Delete comment"
                            }
                          >
                            <Trash className="size-4" aria-hidden />
                          </Button>
                        ) : null}
                      </div>

                      <p className="mt-2 leading-relaxed text-pretty whitespace-pre-wrap">
                        {message.state === "deleted" ? (
                          <span className="text-muted-foreground italic">
                            {props.labels?.deleted ?? "(deleted)"}
                          </span>
                        ) : (
                          message.body
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              {props.state === "resolved" ? (
                <div className="rounded border border-border/60 bg-muted/25 px-3 py-2 text-sm text-muted-foreground">
                  {props.labels?.resolvedDescription ??
                    "This thread is resolved."}
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={props.body}
                    onChange={(event) => props.onBodyChange(event.target.value)}
                    placeholder={props.placeholder}
                    aria-label={props.placeholder}
                    className="min-h-22 resize-none"
                    onKeyDown={handleSubmitShortcut}
                    maxLength={props.maxChars + 200}
                  />

                  <div className="flex items-center justify-between gap-3">
                    <p
                      className={cn(
                        "text-xs tabular-nums",
                        bodyTooLong
                          ? "text-destructive"
                          : "text-muted-foreground",
                      )}
                    >
                      {trimmedBody.length}/{props.maxChars}
                    </p>

                    <Button
                      type="button"
                      size="sm"
                      onClick={props.onSubmit}
                      disabled={disableSubmit}
                    >
                      {props.submitSubmitting ? (
                        <CircleNotch
                          className="size-4 animate-spin motion-reduce:animate-none"
                          aria-hidden
                        />
                      ) : null}
                      <span>{props.submitLabel}</span>
                    </Button>
                  </div>
                </div>
              )}

              {props.state === "resolved" && props.resolvedExpanded ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => props.onResolvedExpandedChange?.(false)}
                  >
                    {props.labels?.hideThread ?? "Hide thread"}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : (
        <div className="p-4">
          <div className="space-y-2">
            <Textarea
              value={props.body}
              onChange={(event) => props.onBodyChange(event.target.value)}
              placeholder={props.placeholder}
              aria-label={props.placeholder}
              className="min-h-22 resize-none"
              onKeyDown={handleSubmitShortcut}
              maxLength={props.maxChars + 200}
              autoFocus
            />

            <div className="flex items-center justify-between gap-3">
              <p
                className={cn(
                  "text-xs tabular-nums",
                  bodyTooLong ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {trimmedBody.length}/{props.maxChars}
              </p>

              <Button
                type="button"
                size="sm"
                onClick={props.onSubmit}
                disabled={disableSubmit}
              >
                {props.submitSubmitting ? (
                  <CircleNotch
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                ) : null}
                <span>{props.submitLabel}</span>
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
