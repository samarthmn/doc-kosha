"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import {
  CheckCircle as CheckCircle2,
  ImageSquare as ImagePlus,
  PaperPlaneTilt as SendHorizonal,
  Trash as Trash2,
} from "@phosphor-icons/react";
import { useRouter, unstable_isUnrecognizedActionError } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SurfaceCard } from "@/components/ui/surface-card";
import {
  BRANDING_ASSETS_BUCKET_NAME,
  TESTIMONIAL_HEADSHOT_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { isSentryEnabled } from "@/lib/deployment";

import {
  submitTestimonialAction,
  type SubmitTestimonialResult,
} from "./actions";
import {
  type TestimonialSubmissionValues,
  testimonialSubmissionSchema,
} from "./schema";

type TestimonialFormProps = {
  workspaceName: string;
  workspaceId: string;
  userId: string;
  initialValues: TestimonialSubmissionValues;
  existingSubmissionAt?: string | null;
  existingHeadshotStoragePath?: string | null;
};

const ALLOWED_HEADSHOT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const formCardClassName =
  "relative overflow-hidden bg-card/45 [box-shadow:none]";
const mutedPanelClassName = "bg-muted/[0.14] border-border/70 rounded border";
const metaLabelClassName =
  "text-[11px] font-medium tracking-[0.12em] uppercase text-muted-foreground";
const fieldClassName =
  "h-10 rounded border-border/80 bg-background/60 shadow-none transition-colors focus-visible:ring-2 motion-reduce:transition-none";
const helperTextClassName = "text-muted-foreground text-xs leading-5";

const buildStoredHeadshotUrl = (
  workspaceId: string,
  storagePath: string,
): string => {
  const query = new URLSearchParams({
    bucket: BRANDING_ASSETS_BUCKET_NAME,
    path: storagePath,
    workspaceId,
  });
  return `/api/storage/file?${query.toString()}`;
};

const formatSubmittedAt = (submittedAt?: string | null): string | null => {
  if (!submittedAt) return null;

  const value = new Date(submittedAt);
  if (Number.isNaN(value.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(value);
};

const SubmittedState: React.FC<{
  workspaceName: string;
  submittedAt?: string | null;
  message?: string;
  headshotPreviewUrl?: string | null;
}> = ({ workspaceName, submittedAt, message, headshotPreviewUrl }) => {
  const formattedDate = formatSubmittedAt(submittedAt);

  return (
    <SurfaceCard
      className={cn(formCardClassName, "ph-no-capture")}
      data-ph-no-capture
    >
      <CardHeader className="relative gap-4 border-b border-border/60 p-5 sm:p-6">
        <p className="dk-nocturne-kicker">Workspace testimonial</p>
        <div className="flex h-10 w-10 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
          <CheckCircle2 className="h-7 w-7" aria-hidden />
        </div>
        <div className="space-y-2">
          <CardTitle className="text-xl font-medium tracking-tight">
            Submission received
          </CardTitle>
          <CardDescription className="max-w-xl text-sm leading-6 md:text-base">
            {message ??
              "Your testimonial is saved for this workspace. This page does not offer edit or resubmit actions."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={cn(mutedPanelClassName, "p-4")}>
            <p className={metaLabelClassName}>Workspace</p>
            <p className="mt-2 text-sm font-medium">{workspaceName}</p>
          </div>
          <div className={cn(mutedPanelClassName, "p-4")}>
            <p className={metaLabelClassName}>Status</p>
            <p className="mt-2 text-sm font-medium">
              {formattedDate
                ? `Submitted on ${formattedDate}`
                : "Already saved"}
            </p>
          </div>
        </div>
        {headshotPreviewUrl ? (
          <div
            className={cn(
              mutedPanelClassName,
              "flex flex-col gap-4 p-4 sm:flex-row sm:items-center",
            )}
          >
            <div className="relative h-20 w-20 overflow-hidden rounded border border-border/70">
              <Image
                src={headshotPreviewUrl}
                alt="Submitted headshot"
                fill
                unoptimized
                className="object-cover"
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Headshot uploaded</p>
              <p className="text-sm leading-6 text-muted-foreground">
                Optional image saved with your submission.
              </p>
            </div>
          </div>
        ) : null}
        <div className={cn(mutedPanelClassName, "p-4")}>
          <p className={metaLabelClassName}>Usage note</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Your submission is stored once for this workspace and can be
            reviewed internally for future public-feature use.
          </p>
        </div>
      </CardContent>
    </SurfaceCard>
  );
};

export const TestimonialForm: React.FC<TestimonialFormProps> = ({
  workspaceName,
  workspaceId,
  userId,
  initialValues,
  existingSubmissionAt,
  existingHeadshotStoragePath,
}) => {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [submittedAt, setSubmittedAt] = useState<string | null>(
    existingSubmissionAt ?? null,
  );
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(
    Boolean(existingSubmissionAt),
  );
  const [headshotFile, setHeadshotFile] = useState<File | null>(null);
  const [headshotPreviewUrl, setHeadshotPreviewUrl] = useState<string | null>(
    existingHeadshotStoragePath
      ? buildStoredHeadshotUrl(workspaceId, existingHeadshotStoragePath)
      : null,
  );
  const [storedHeadshotPath, setStoredHeadshotPath] = useState<string | null>(
    existingHeadshotStoragePath ?? null,
  );
  const [isUploadingHeadshot, setIsUploadingHeadshot] = useState(false);
  const [headshotError, setHeadshotError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TestimonialSubmissionValues>({
    resolver: zodResolver(testimonialSubmissionSchema),
    defaultValues: initialValues,
  });
  const testimonialValue = watch("testimonial");

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
      }
    };
  }, []);

  const submitLabel =
    isPending || isSubmitting || isUploadingHeadshot
      ? "Submitting..."
      : "Submit";

  const replacePreviewUrl = (nextUrl: string | null, isObjectUrl: boolean) => {
    if (objectUrlRef.current && objectUrlRef.current !== nextUrl) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }

    if (isObjectUrl && nextUrl) {
      objectUrlRef.current = nextUrl;
    }

    setHeadshotPreviewUrl(nextUrl);
  };

  const handleHeadshotSelection = (file: File | null) => {
    if (!file) return;

    if (!ALLOWED_HEADSHOT_MIME_TYPES.has(file.type)) {
      setHeadshotError("Headshot must be JPG, PNG, or WebP.");
      return;
    }

    if (file.size > TESTIMONIAL_HEADSHOT_MAX_FILE_SIZE_BYTES) {
      setHeadshotError("Headshot must be 2MB or smaller.");
      return;
    }

    setHeadshotError(null);
    setHeadshotFile(file);
    const objectUrl = URL.createObjectURL(file);
    replacePreviewUrl(objectUrl, true);
  };

  const removeHeadshot = () => {
    setHeadshotError(null);
    setHeadshotFile(null);
    replacePreviewUrl(null, false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const cleanupUploadedHeadshot = async (path: string) => {
    await fetch("/api/storage/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        workspaceId,
        logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
        path,
      }),
    }).catch((error: unknown) => {
      console.error("[testimonial] failed to clean up headshot", error);
    });
  };

  const uploadHeadshot = async (file: File): Promise<string> => {
    const extension = (file.name.split(".").pop() || "jpg").toLowerCase();
    const safeExtension = extension.replace(/[^a-z0-9]/g, "") || "jpg";
    const filename = `headshot-${Date.now()}.${safeExtension}`;

    const presignRes = await fetch("/api/storage/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        assetKind: "branding",
        workspaceId,
        filename,
        contentType: file.type,
        fileSizeBytes: file.size,
        brandingSubpath: `testimonials/${userId}`,
      }),
    });

    if (!presignRes.ok) {
      const payload = await presignRes.json().catch(() => ({}));
      throw new Error(
        payload?.error || `Failed to get upload URL (${presignRes.status})`,
      );
    }

    const { uploadUrl, storagePath } = (await presignRes.json()) as {
      uploadUrl?: string;
      storagePath?: string;
    };

    if (!uploadUrl || !storagePath) {
      throw new Error("Invalid response from upload endpoint.");
    }

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!uploadRes.ok) {
      throw new Error("Headshot upload failed.");
    }

    return storagePath;
  };

  const applyServerResult = (result: SubmitTestimonialResult) => {
    if (result.status === "success") {
      setHasSubmitted(true);
      setSubmittedAt(result.submittedAt);
      setServerMessage(result.message);
      setStoredHeadshotPath(result.headshotStoragePath ?? null);
      router.refresh();
      return;
    }

    if (result.fieldErrors?.name) {
      setError("name", { type: "server", message: result.fieldErrors.name });
    }
    if (result.fieldErrors?.roleTitle) {
      setError("roleTitle", {
        type: "server",
        message: result.fieldErrors.roleTitle,
      });
    }
    if (result.fieldErrors?.company) {
      setError("company", {
        type: "server",
        message: result.fieldErrors.company,
      });
    }
    if (result.fieldErrors?.testimonial) {
      setError("testimonial", {
        type: "server",
        message: result.fieldErrors.testimonial,
      });
    }

    if (result.alreadySubmitted) {
      setHasSubmitted(true);
      setSubmittedAt(result.submittedAt ?? null);
      if (result.headshotStoragePath) {
        setStoredHeadshotPath(result.headshotStoragePath);
        replacePreviewUrl(
          buildStoredHeadshotUrl(workspaceId, result.headshotStoragePath),
          false,
        );
      }
    }

    setServerMessage(result.message);
  };

  const onSubmit = handleSubmit(async (values) => {
    setServerMessage(null);
    setNeedsReload(false);
    setHeadshotError(null);

    let uploadedHeadshotPath: string | null = storedHeadshotPath;

    if (headshotFile) {
      try {
        setIsUploadingHeadshot(true);
        uploadedHeadshotPath = await uploadHeadshot(headshotFile);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Headshot upload failed.";
        setHeadshotError(message);
        setIsUploadingHeadshot(false);
        return;
      } finally {
        setIsUploadingHeadshot(false);
      }
    }

    startTransition(async () => {
      try {
        const result = await submitTestimonialAction({
          ...values,
          headshotStoragePath: uploadedHeadshotPath,
        });

        if (result.status === "error" && uploadedHeadshotPath && headshotFile) {
          await cleanupUploadedHeadshot(uploadedHeadshotPath);
        }

        if (result.status === "success" && uploadedHeadshotPath) {
          setStoredHeadshotPath(uploadedHeadshotPath);
          replacePreviewUrl(
            buildStoredHeadshotUrl(workspaceId, uploadedHeadshotPath),
            false,
          );
        }

        applyServerResult(result);
      } catch (error) {
        if (unstable_isUnrecognizedActionError(error)) {
          // The action never ran, so this attempt's new upload is unreferenced.
          if (uploadedHeadshotPath && headshotFile) {
            await cleanupUploadedHeadshot(uploadedHeadshotPath);
          }
          setNeedsReload(true);
          setServerMessage(
            "The app was updated. Your entries are still here. Copy them before reloading this page, then submit again.",
          );
        } else {
          // A transport failure does not prove the action failed to save. Keep
          // uploaded assets intact instead of deleting a possibly saved headshot.
          setServerMessage(
            "We couldn't confirm your submission. Your entries are still here. Please try again.",
          );
          if (isSentryEnabled()) Sentry.captureException(error);
        }
      }
    });
  });

  if (hasSubmitted) {
    return (
      <SubmittedState
        workspaceName={workspaceName}
        submittedAt={submittedAt}
        message={serverMessage ?? undefined}
        headshotPreviewUrl={headshotPreviewUrl}
      />
    );
  }

  return (
    <SurfaceCard
      className={cn(formCardClassName, "ph-no-capture")}
      data-ph-no-capture
    >
      <CardContent className="space-y-6 p-5 sm:p-6">
        <form onSubmit={onSubmit} className="space-y-6" noValidate>
          <section
            className="space-y-3"
            aria-labelledby="testimonial-headshot-label"
          >
            <div className="flex items-center justify-between gap-3">
              <Label
                id="testimonial-headshot-label"
                htmlFor="testimonial-headshot"
              >
                Headshot
              </Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <input
              ref={fileInputRef}
              id="testimonial-headshot"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                handleHeadshotSelection(event.target.files?.[0] ?? null);
              }}
            />
            <div className="flex flex-col gap-4 rounded bg-muted/[0.14] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-4">
                <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded border border-border/80 bg-background">
                  {headshotPreviewUrl ? (
                    <Image
                      src={headshotPreviewUrl}
                      alt="Headshot preview"
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <ImagePlus
                      className="h-7 w-7 text-muted-foreground"
                      aria-hidden
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <p className="text-sm font-medium">Optional profile image</p>
                  <p
                    id="testimonial-headshot-hint"
                    className="text-sm leading-6 text-muted-foreground"
                  >
                    Add a JPG, PNG, or WebP headshot up to 2MB. Skip this if you
                    only want to share written feedback.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  aria-describedby="testimonial-headshot-hint"
                >
                  <ImagePlus className="mr-2 h-4 w-4" aria-hidden />
                  Choose headshot
                </Button>
                {headshotPreviewUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={removeHeadshot}
                  >
                    <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                    Remove
                  </Button>
                ) : null}
              </div>
            </div>
            {headshotError ? (
              <p className="text-sm text-destructive" role="alert">
                {headshotError}
              </p>
            ) : null}
          </section>

          <section className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="testimonial-name">Name</Label>
              <Input
                id="testimonial-name"
                placeholder="Jane Patel"
                className={cn(
                  fieldClassName,
                  errors.name && "border-destructive",
                )}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={
                  errors.name
                    ? "testimonial-name-hint testimonial-name-error"
                    : "testimonial-name-hint"
                }
                {...register("name")}
              />
              <p id="testimonial-name-hint" className={helperTextClassName}>
                How you want your name shown.
              </p>
              {errors.name?.message ? (
                <p
                  id="testimonial-name-error"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="testimonial-role-title">Role / Title</Label>
              <Input
                id="testimonial-role-title"
                placeholder="Managing Director"
                className={cn(
                  fieldClassName,
                  errors.roleTitle && "border-destructive",
                )}
                aria-invalid={Boolean(errors.roleTitle)}
                aria-describedby={
                  errors.roleTitle
                    ? "testimonial-role-title-hint testimonial-role-title-error"
                    : "testimonial-role-title-hint"
                }
                {...register("roleTitle")}
              />
              <p
                id="testimonial-role-title-hint"
                className={helperTextClassName}
              >
                Your title or role.
              </p>
              {errors.roleTitle?.message ? (
                <p
                  id="testimonial-role-title-error"
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {errors.roleTitle.message}
                </p>
              ) : null}
            </div>
          </section>

          <section className="space-y-2">
            <Label htmlFor="testimonial-company">Company</Label>
            <Input
              id="testimonial-company"
              placeholder="Northwind Advisory"
              className={cn(
                fieldClassName,
                errors.company && "border-destructive",
              )}
              aria-invalid={Boolean(errors.company)}
              aria-describedby={
                errors.company
                  ? "testimonial-company-hint testimonial-company-error"
                  : "testimonial-company-hint"
              }
              {...register("company")}
            />
            <p id="testimonial-company-hint" className={helperTextClassName}>
              Company or team name.
            </p>
            {errors.company?.message ? (
              <p
                id="testimonial-company-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.company.message}
              </p>
            ) : null}
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="testimonial-body">Testimonial</Label>
              <span
                className="text-xs text-muted-foreground tabular-nums"
                aria-live="polite"
              >
                {(testimonialValue ?? "").trim().length}/3000
              </span>
            </div>
            <Textarea
              id="testimonial-body"
              placeholder="What changed for your team after using DocKosha? Focus on outcomes, speed, clarity, or client confidence."
              className={cn(
                "min-h-44 resize-y rounded border-border/80 bg-background/60 px-4 py-3 text-sm leading-6 shadow-none",
                errors.testimonial && "border-destructive",
              )}
              aria-invalid={Boolean(errors.testimonial)}
              aria-describedby={
                errors.testimonial
                  ? "testimonial-body-hint testimonial-body-error"
                  : "testimonial-body-hint"
              }
              {...register("testimonial")}
            />
            <p id="testimonial-body-hint" className={helperTextClassName}>
              Aim for 2 to 5 sentences. Specific examples are more useful than
              broad praise.
            </p>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-full border border-border/80 px-2.5 py-1">
                Outcome
              </span>
              <span className="rounded-full border border-border/80 px-2.5 py-1">
                Workflow improvement
              </span>
              <span className="rounded-full border border-border/80 px-2.5 py-1">
                Trust or control
              </span>
            </div>
            {errors.testimonial?.message ? (
              <p
                id="testimonial-body-error"
                className="text-sm text-destructive"
                role="alert"
              >
                {errors.testimonial.message}
              </p>
            ) : null}
          </section>

          {serverMessage ? (
            <div
              className={cn(
                "rounded border px-4 py-3 text-sm leading-6",
                hasSubmitted
                  ? "border-primary/20 bg-primary/10 text-foreground"
                  : "border-destructive/20 bg-destructive/10 text-foreground",
              )}
              role={hasSubmitted ? "status" : "alert"}
              aria-live={hasSubmitted ? "polite" : "assertive"}
            >
              {serverMessage}
              {needsReload ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 block"
                  onClick={() => window.location.reload()}
                >
                  Reload page
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 border-t border-border/70 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Saved once for {workspaceName}.</p>
              <p className="text-xs leading-5">
                Headshot uploads are stored securely.
              </p>
            </div>
            <Button
              type="submit"
              size="lg"
              className="min-w-40 px-6"
              disabled={isPending || isSubmitting || isUploadingHeadshot}
            >
              <SendHorizonal className="mr-2 h-4 w-4" aria-hidden />
              {submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </SurfaceCard>
  );
};
