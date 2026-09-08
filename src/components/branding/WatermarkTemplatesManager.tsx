import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import {
  FileText,
  PencilSimple as Pencil,
  Plus,
  ShieldCheck,
  Trash as Trash2,
  UploadSimple as Upload,
} from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CardContent, CardHeader } from "@/components/ui/card";
import { SurfaceCard } from "@/components/ui/surface-card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { showError, showSuccess } from "@/lib/toast";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import { Switch } from "@/components/ui/switch";
import {
  type WatermarkContentMode,
  type WatermarkPattern,
  type WatermarkTemplateDefinition,
  type WatermarkTemplateRow,
} from "@/lib/watermarks";
import {
  BRANDING_ASSETS_BUCKET_NAME,
  BRANDING_LOGO_MAX_FILE_SIZE_BYTES,
} from "@/lib/constants";
import type { TablesInsert, TablesUpdate } from "@/types/generated/supabase";
import type { WatermarkDefinition } from "@/lib/branding";
import { createWatermarkOverlayModel } from "@/lib/watermark";
import { exitFade } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useRecentlyAddedRows } from "@/hooks/useRecentlyAddedRows";

const WatermarkTemplatePreviewPdf = dynamic(
  () => import("@/components/branding/WatermarkTemplatePreviewPdf"),
  { ssr: false },
);

type TemplateDraft = {
  id: string | null;
  name: string;
  definition: WatermarkTemplateDefinition;
  imagePath: string | null;
  imageFile: File | null;
  imagePreview: string | null;
  is_default?: boolean;
};

const DEFAULT_DEFINITION: WatermarkTemplateDefinition = {
  text: "CONFIDENTIAL",
  color: "#4B5563",
  fontSize: 1.6,
  opacity: 0.65,
  pattern: "diagonal_grid",
  rotationDeg: -40,
  xSpacing: 320,
  ySpacing: 320,
  type: "text",
  imageWidthPt: 180,
  imageHeightPt: 180,
};

const DEFAULT_PREVIEW_EMAIL = "viewer@example.com";
const DEFAULT_PREVIEW_IP = "203.0.113.42";

const toDraft = (row?: WatermarkTemplateRow | null): TemplateDraft => {
  if (!row) {
    return {
      id: null,
      name: "New watermark",
      definition: { ...DEFAULT_DEFINITION },
      imagePath: null,
      imageFile: null,
      imagePreview: null,
      is_default: false,
    };
  }
  const definition = (row.definition as WatermarkTemplateDefinition) ?? {};
  return {
    id: row.id,
    name: row.name ?? "Untitled watermark",
    definition: {
      ...DEFAULT_DEFINITION,
      ...definition,
    },
    imagePath: row.image_storage_path ?? null,
    imageFile: null,
    imagePreview: null,
    is_default: row.is_default,
  };
};

const PatternOptions: { value: WatermarkPattern; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "diagonal_grid", label: "Diagonal grid" },
  { value: "grid", label: "Grid" },
];

const ModeOptions: { value: WatermarkContentMode; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "image", label: "Image" },
  { value: "hybrid", label: "Hybrid (text + image)" },
];

interface Props {
  workspaceId: string;
}

const WatermarkTemplatesManager: React.FC<Props> = ({ workspaceId }) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [templates, setTemplates] = useState<WatermarkTemplateRow[]>([]);
  const {
    isRecentlyAdded: isRecentlyAddedTemplate,
    markRecentlyAdded: markRecentlyAddedTemplate,
  } = useRecentlyAddedRows();
  const [draft, setDraft] = useState<TemplateDraft>(() => toDraft());
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [previewDynamicEmailEnabled, setPreviewDynamicEmailEnabled] =
    useState<boolean>(false);
  const [previewDynamicIpEnabled, setPreviewDynamicIpEnabled] =
    useState<boolean>(false);
  const [previewDynamicDateTimeEnabled, setPreviewDynamicDateTimeEnabled] =
    useState<boolean>(false);
  const [previewEmail, setPreviewEmail] = useState<string>(
    DEFAULT_PREVIEW_EMAIL,
  );
  const [previewIp, setPreviewIp] = useState<string>(DEFAULT_PREVIEW_IP);
  const [previewDateTime, setPreviewDateTime] = useState<string>(() =>
    new Date().toISOString(),
  );

  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const resolvedContentType = (draft.definition.type ??
    "text") as WatermarkContentMode;
  const resolvedPattern = (draft.definition.pattern ??
    "diagonal_grid") as WatermarkPattern;
  const defaultRotationDeg = resolvedPattern === "diagonal_grid" ? -40 : 0;
  const resolvedRotationDeg =
    typeof draft.definition.rotationDeg === "number"
      ? draft.definition.rotationDeg
      : defaultRotationDeg;
  const resolvedImageSizePt = (() => {
    const candidate =
      typeof draft.definition.imageWidthPt === "number"
        ? draft.definition.imageWidthPt
        : typeof draft.definition.imageHeightPt === "number"
          ? draft.definition.imageHeightPt
          : 180;
    if (!Number.isFinite(candidate)) return 180;
    if (candidate < 24) return 24;
    if (candidate > 600) return 600;
    return candidate;
  })();

  const loadTemplates = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("watermarks")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as WatermarkTemplateRow[];
      setTemplates(rows);
    } catch (err) {
      console.error("[watermarks] failed to load templates", err);
      showError("Unable to load watermark templates");
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, [supabase, workspaceId]);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  const openEditorFor = useCallback((row?: WatermarkTemplateRow | null) => {
    setDraft(toDraft(row ?? null));
    setPreviewDynamicEmailEnabled(false);
    setPreviewDynamicIpEnabled(false);
    setPreviewEmail(DEFAULT_PREVIEW_EMAIL);
    setPreviewIp(DEFAULT_PREVIEW_IP);
    setEditorOpen(true);
  }, []);

  const closeEditor = useCallback(() => {
    setEditorOpen(false);
  }, []);

  const handleInput = <K extends keyof TemplateDraft>(
    key: K,
    value: TemplateDraft[K],
  ) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const handleDefinitionChange = (
    patch: Partial<WatermarkTemplateDefinition>,
  ) => {
    setDraft((prev) => ({
      ...prev,
      definition: { ...prev.definition, ...patch },
    }));
  };

  const handleImageChange = async (file: File | null) => {
    if (!file) {
      setDraft((prev) => ({
        ...prev,
        imageFile: null,
        imagePreview: null,
        definition: { ...prev.definition, imageDataUrl: null },
      }));
      return;
    }

    if (file.size > BRANDING_LOGO_MAX_FILE_SIZE_BYTES) {
      showError("Image must be 2MB or smaller");
      return;
    }

    let resolvedFile = file;
    if (file.type === "image/webp") {
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          bitmap.close?.();
          throw new Error("Unable to process image");
        }
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close?.();
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob(resolve, "image/png");
        });
        if (!blob) {
          throw new Error("Unable to convert image");
        }
        const nextName =
          file.name.replace(/\.webp$/i, ".png") || "watermark.png";
        resolvedFile = new File([blob], nextName, { type: "image/png" });
      } catch (error) {
        console.error("[watermarks] webp conversion failed", error);
        showError("WebP watermark images must be converted to PNG");
        return;
      }
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      setDraft((prev) => ({
        ...prev,
        imageFile: resolvedFile,
        imagePreview: dataUrl,
        definition: { ...prev.definition, imageDataUrl: dataUrl },
      }));
    };
    reader.readAsDataURL(resolvedFile);
  };

  const uploadImageIfNeeded = async (
    watermarkId: string,
  ): Promise<{ path: string | null; previousRemoved: boolean }> => {
    if (!draft.imageFile) {
      return { path: draft.imagePath ?? null, previousRemoved: false };
    }
    const ext = (draft.imageFile.name.split(".").pop() || "png").toLowerCase();
    const filename = `${watermarkId}.${ext}`;

    // Get presigned upload URL from server
    const presignRes = await fetch("/api/storage/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        assetKind: "branding",
        workspaceId,
        filename,
        contentType: draft.imageFile.type,
        brandingSubpath: "watermarks",
      }),
    });

    if (!presignRes.ok) {
      const data = await presignRes.json().catch(() => ({}));
      throw new Error(
        data?.error || `Failed to get upload URL (${presignRes.status})`,
      );
    }

    const { uploadUrl, storagePath } = await presignRes.json();

    // Upload directly to R2
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: draft.imageFile,
      headers: {
        "Content-Type": draft.imageFile.type,
      },
    });

    if (!uploadRes.ok) {
      throw new Error("Image upload failed");
    }

    // Clean up old image if path changed
    let previousRemoved = false;
    if (draft.imagePath && draft.imagePath !== storagePath) {
      await fetch("/api/storage/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          workspaceId,
          logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
          path: draft.imagePath,
        }),
      }).catch((err) => console.error("Failed to remove old image:", err));
      previousRemoved = true;
    }

    return { path: storagePath, previousRemoved };
  };

  const saveTemplate = async () => {
    if (!workspaceId) return;
    if (!draft.name.trim()) {
      showError("Watermark name is required");
      return;
    }

    const requiresText =
      resolvedContentType === "text" || resolvedContentType === "hybrid";
    const requiresImage =
      resolvedContentType === "image" || resolvedContentType === "hybrid";

    if (requiresText && !draft.definition.text?.trim()) {
      showError("Watermark text is required");
      return;
    }
    if (requiresImage && !draft.imageFile && !draft.imagePath) {
      showError("Upload an image for Image/Hybrid watermarks");
      return;
    }

    setSaving(true);
    const isUpdate = Boolean(draft.id);
    const watermarkId = draft.id ?? crypto.randomUUID();
    try {
      let imagePath = draft.imagePath ?? null;
      if (requiresImage) {
        const uploadResult = await uploadImageIfNeeded(watermarkId);
        imagePath = uploadResult.path;
      }

      const common: Omit<TablesInsert<"watermarks">, "id"> = {
        workspace_id: workspaceId,
        name: draft.name.trim(),
        definition: { ...draft.definition, imageDataUrl: null },
        image_storage_path: imagePath,
        is_default: draft.is_default ?? false,
      };

      const { data, error } = draft.id
        ? await supabase
            .from("watermarks")
            .update(common satisfies TablesUpdate<"watermarks">)
            .eq("id", draft.id)
            .select("*")
            .single()
        : await supabase
            .from("watermarks")
            .insert({
              id: watermarkId,
              ...common,
            } satisfies TablesInsert<"watermarks">)
            .select("*")
            .single();

      if (error) throw error;
      const saved = data as WatermarkTemplateRow;
      setTemplates((prev) => {
        const existingIdx = prev.findIndex((t) => t.id === saved.id);
        if (existingIdx >= 0) {
          const next = [...prev];
          next[existingIdx] = saved;
          return next;
        }
        return [saved, ...prev];
      });
      // Flash only a genuinely new row; an update leaves the row where it was,
      // so there is nothing for the user to re-locate.
      if (!isUpdate) {
        markRecentlyAddedTemplate([saved.id]);
      }
      setDraft(toDraft(saved));
      showSuccess(isUpdate ? "Watermark updated" : "Watermark created");
      trackProductEvent(isUpdate ? "watermark_updated" : "watermark_created", {
        watermark_id: saved.id,
        workspace_id: workspaceId,
        is_default: saved.is_default,
      });
      // Close the editor once the create/update has persisted.
      closeEditor();
    } catch (err) {
      console.error("[watermarks] save failed", err);
      // Unique index uniq_watermarks_workspace_name (workspace_id, name):
      // surface a precise, actionable message instead of the generic error.
      const code =
        err && typeof err === "object" && "code" in err
          ? (err as { code?: string }).code
          : undefined;
      if (code === "23505") {
        showError(
          `A watermark named "${draft.name.trim()}" already exists. Choose a different name.`,
        );
      } else {
        showError("Unable to save watermark");
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (id: string) => {
    try {
      const target = templates.find((t) => t.id === id);
      const { error } = await supabase.from("watermarks").delete().eq("id", id);
      if (error) throw error;
      if (target?.image_storage_path) {
        // Clean up image from R2
        await fetch("/api/storage/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            workspaceId,
            logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
            path: target.image_storage_path,
          }),
        }).catch((err) =>
          console.error("Failed to remove watermark image:", err),
        );
      }
      // Detach deleted template from any links that reference it so they
      // don't end up with a stale watermark_id pointing at a missing row.
      // Keep apply_watermark and the dynamic flags untouched: with
      // watermark_id null the public watermark route falls back to the
      // workspace branding watermark (or none), matching the delete dialog.
      if (workspaceId) {
        await supabase
          .from("links")
          .update({ watermark_id: null })
          .eq("workspace_id", workspaceId)
          .eq("watermark_id", id)
          .then(({ error: detachErr }) => {
            if (detachErr) {
              console.error(
                "[watermarks] failed to detach template from links",
                detachErr,
              );
            }
          });
      }
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      setDraft(toDraft(templates.find((t) => t.id !== id) ?? null));
      showSuccess("Watermark deleted");
      trackProductEvent("watermark_deleted", {
        watermark_id: id,
        workspace_id: workspaceId,
      });
    } catch (err) {
      console.error("[watermarks] delete failed", err);
      showError("Unable to delete watermark");
    }
  };

  // Compute watermark overlay model for instant client-side preview
  const previewWatermarkOverlay = useMemo(() => {
    const text = draft.definition.text?.trim() ?? "";
    const hasImage = Boolean(draft.definition.imageDataUrl || draft.imagePath);
    const requiresText =
      resolvedContentType === "text" || resolvedContentType === "hybrid";
    const requiresImage =
      resolvedContentType === "image" || resolvedContentType === "hybrid";

    // Don't show preview if required content is missing
    if (requiresText && !text) {
      return null;
    }
    if (requiresImage && !hasImage) {
      return null;
    }

    // Build WatermarkDefinition from draft
    const definition: WatermarkDefinition = {
      text: text || "WATERMARK",
      color: draft.definition.color?.trim() || "#4B5563",
      fontSize: draft.definition.fontSize ?? 1.6,
      opacity: draft.definition.opacity ?? 0.65,
      pattern: resolvedPattern,
      rotationDeg: resolvedRotationDeg,
      xSpacing: draft.definition.xSpacing ?? 320,
      ySpacing: draft.definition.ySpacing ?? 320,
      mode: resolvedContentType,
      imageWidthPt: resolvedImageSizePt,
      imageHeightPt: resolvedImageSizePt,
      imagePath: draft.imagePath ?? undefined,
    };

    // Build dynamic values from preview toggles
    const dynamicValues: Record<string, string> = {};
    if (previewDynamicEmailEnabled && previewEmail.trim()) {
      dynamicValues.email = previewEmail.trim();
    }
    if (previewDynamicIpEnabled && previewIp.trim()) {
      dynamicValues.ip = previewIp.trim();
    }
    if (previewDynamicDateTimeEnabled) {
      dynamicValues.datetime = previewDateTime;
    }

    // Compute image URL for preview
    // Prefer local data URL from upload, else use storage proxy for existing path
    let imageUrl: string | null = null;
    if (resolvedContentType === "image" || resolvedContentType === "hybrid") {
      if (draft.imagePreview) {
        imageUrl = draft.imagePreview;
      } else if (draft.imagePath) {
        imageUrl = `/api/storage/file?bucket=${BRANDING_ASSETS_BUCKET_NAME}&path=${encodeURIComponent(draft.imagePath)}&workspaceId=${workspaceId}`;
      }
    }

    return {
      overlay: createWatermarkOverlayModel(
        definition,
        Object.keys(dynamicValues).length > 0 ? dynamicValues : undefined,
        { imageUrl },
      ),
      definition,
      dynamicValues:
        Object.keys(dynamicValues).length > 0 ? dynamicValues : undefined,
      imageUrl,
    };
  }, [
    draft.definition.text,
    draft.definition.color,
    draft.definition.fontSize,
    draft.definition.opacity,
    draft.definition.xSpacing,
    draft.definition.ySpacing,
    draft.definition.imageDataUrl,
    draft.imagePath,
    draft.imagePreview,
    resolvedContentType,
    resolvedPattern,
    resolvedRotationDeg,
    resolvedImageSizePt,
    previewDynamicEmailEnabled,
    previewDynamicIpEnabled,
    previewDynamicDateTimeEnabled,
    previewEmail,
    previewIp,
    previewDateTime,
    workspaceId,
  ]);

  // Compute the preview error message for user guidance
  const previewError = useMemo(() => {
    const text = draft.definition.text?.trim() ?? "";
    const hasImage = Boolean(draft.definition.imageDataUrl || draft.imagePath);
    const requiresText =
      resolvedContentType === "text" || resolvedContentType === "hybrid";
    const requiresImage =
      resolvedContentType === "image" || resolvedContentType === "hybrid";

    if (requiresText && !text) {
      return "Enter watermark text to see the preview.";
    }
    if (requiresImage && !hasImage) {
      return "Upload an image to see the preview.";
    }
    return null;
  }, [
    draft.definition.text,
    draft.definition.imageDataUrl,
    draft.imagePath,
    resolvedContentType,
  ]);

  return (
    <section className="space-y-4" aria-labelledby="watermark-templates-title">
      <SurfaceCard className="overflow-hidden bg-card/45 [box-shadow:none]">
        <CardHeader className="border-b border-border/60 pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded border border-primary/20 bg-primary/[0.06] text-primary">
                <ShieldCheck size={17} aria-hidden="true" />
              </span>
              <div>
                <p className="dk-nocturne-kicker">Document protection</p>
                <h3 id="watermark-templates-title" className="mt-1 font-medium">
                  Watermark templates
                </h3>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Create reusable watermark styles and attach them to links.
                  Preview updates automatically while you edit.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openEditorFor(null)}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              New template
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="text-sm text-muted-foreground">
              Loading templates…
            </div>
          ) : templates.length === 0 ? (
            <EmptyState
              variant="bare"
              icon={<FileText size={17} aria-hidden="true" />}
              title="No templates yet"
              description="Create your first watermark template to protect shared documents."
              actions={
                <Button onClick={() => openEditorFor(null)}>
                  <Plus className="mr-2 h-4 w-4" aria-hidden />
                  Create watermark
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60">
                    <th className="dk-nocturne-kicker px-3 py-2 text-left">
                      Name
                    </th>
                    <th className="dk-nocturne-kicker px-3 py-2 text-left">
                      Content
                    </th>
                    <th className="dk-nocturne-kicker px-3 py-2 text-left">
                      Type
                    </th>
                    <th className="dk-nocturne-kicker px-3 py-2 text-left">
                      Pattern
                    </th>
                    <th className="dk-nocturne-kicker px-3 py-2 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {/* Deleting a template filters this list in place rather than
                      refetching, so the removed row fades out instead of
                      vanishing between paints. */}
                  <AnimatePresence initial={false}>
                    {templates.map((tpl) => {
                      const tplDef =
                        (tpl.definition as WatermarkTemplateDefinition | null) ??
                        null;
                      const subtitle = tplDef?.text?.trim() || "—";
                      const pattern =
                        (tplDef?.pattern as WatermarkPattern | null) ?? "grid";
                      const mode =
                        (tplDef?.type as WatermarkContentMode | null) ?? "text";

                      const patternLabel =
                        PatternOptions.find((p) => p.value === pattern)
                          ?.label ?? "Grid";
                      const modeLabel =
                        ModeOptions.find((m) => m.value === mode)?.label ??
                        "Text";

                      return (
                        <motion.tr
                          key={tpl.id}
                          {...exitFade}
                          className={cn(
                            "transition-colors hover:bg-muted/35",
                            isRecentlyAddedTemplate(tpl.id) && "dk-row-flash",
                          )}
                        >
                          <td className="p-3 align-middle font-medium">
                            <div className="flex items-center gap-2">
                              <span>{tpl.name}</span>
                              {tpl.is_default ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px]"
                                >
                                  Default
                                </Badge>
                              ) : null}
                            </div>
                          </td>
                          <td className="p-3 align-middle">
                            <span className="line-clamp-1 max-w-[200px] text-xs text-muted-foreground">
                              {subtitle}
                            </span>
                          </td>
                          <td className="p-3 align-middle">
                            <Badge variant="outline" className="font-normal">
                              {modeLabel}
                            </Badge>
                          </td>
                          <td className="p-3 align-middle">
                            <Badge variant="outline" className="font-normal">
                              {patternLabel}
                            </Badge>
                          </td>
                          <td className="p-3 text-right align-middle">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                onClick={() => openEditorFor(tpl)}
                              >
                                <Pencil className="h-3.5 w-3.5" aria-hidden />
                                <span className="sr-only">Edit</span>
                              </Button>
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                  >
                                    <Trash2
                                      className="h-3.5 w-3.5 text-muted-foreground hover:text-red-600"
                                      aria-hidden
                                    />
                                    <span className="sr-only">Delete</span>
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>
                                      Delete watermark?
                                    </AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete{" "}
                                      <strong>{tpl.name}</strong>. Links using
                                      this template will fall back to branding
                                      watermark (or no watermark if none is
                                      configured).
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>
                                      Cancel
                                    </AlertDialogCancel>
                                    <AlertDialogAction
                                      variant="destructive"
                                      onClick={() =>
                                        void deleteTemplate(tpl.id)
                                      }
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </SurfaceCard>

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) closeEditor();
          else setEditorOpen(true);
        }}
      >
        <DialogContent
          className="ph-no-capture h-dvh max-h-dvh max-w-7xl gap-0 overflow-hidden p-0 sm:h-[85vh] sm:max-h-[85vh]"
          data-ph-no-capture
        >
          <div className="flex h-full flex-col">
            <DialogHeader className="z-10 shrink-0 border-b border-border/60 bg-background px-5 py-3">
              <p className="dk-nocturne-kicker">Template editor</p>
              <DialogTitle className="font-medium">
                {draft.id
                  ? "Edit watermark template"
                  : "Create watermark template"}
              </DialogTitle>
              <DialogDescription>
                Configure your watermark style and preview it instantly.
              </DialogDescription>
            </DialogHeader>

            <div className="flex min-h-0 flex-1 flex-col divide-y overflow-y-auto lg:flex-row lg:divide-x lg:divide-y-0 lg:overflow-hidden">
              {/* Left Column: Configuration */}
              <div
                className="custom-scrollbar w-full shrink-0 bg-muted/10 lg:h-full lg:w-[58%] lg:overflow-y-auto"
                data-guide="branding-watermark-controls"
              >
                <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 md:grid-cols-2 md:gap-x-8">
                  {/* General Section */}
                  <div className="space-y-3 md:col-span-1">
                    <h4 className="text-sm font-medium tracking-tight">
                      General
                    </h4>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="wm-name">Template name</Label>
                          <Input
                            id="wm-name"
                            value={draft.name}
                            maxLength={80}
                            onChange={(e) =>
                              handleInput("name", e.target.value)
                            }
                            placeholder="e.g. Confidential Internal"
                            className="bg-background"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Content type</Label>
                          <Tabs
                            value={resolvedContentType}
                            onValueChange={(v) =>
                              handleDefinitionChange({
                                type: v as WatermarkContentMode,
                              })
                            }
                            className="w-full"
                          >
                            <TabsList className="grid w-full grid-cols-3">
                              {ModeOptions.map((opt) => (
                                <TabsTrigger key={opt.value} value={opt.value}>
                                  {opt.label.split(" ")[0]}
                                </TabsTrigger>
                              ))}
                            </TabsList>
                          </Tabs>
                        </div>
                      </div>

                      {/* Text Content Input */}
                      {(resolvedContentType === "text" ||
                        resolvedContentType === "hybrid") && (
                        <div className="animate-in space-y-2 fade-in-0 slide-in-from-top-2">
                          <Label htmlFor="wm-text">Watermark text</Label>
                          <Input
                            id="wm-text"
                            value={draft.definition.text ?? ""}
                            maxLength={120}
                            onChange={(e) =>
                              handleDefinitionChange({ text: e.target.value })
                            }
                            placeholder="CONFIDENTIAL"
                            className="bg-background"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Appearance Section */}
                  <div className="space-y-3 md:col-span-1">
                    <h4 className="text-sm font-medium tracking-tight">
                      Appearance
                    </h4>

                    {/* Image Upload */}
                    {resolvedContentType !== "text" && (
                      <div className="space-y-3 rounded bg-muted/[0.14] p-4">
                        <div className="flex items-start gap-4">
                          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-border/70 bg-background">
                            {draft.imagePreview || draft.imagePath ? (
                              <img
                                src={
                                  draft.imagePreview ??
                                  (draft.imagePath
                                    ? `/api/storage/file?bucket=${BRANDING_ASSETS_BUCKET_NAME}&path=${encodeURIComponent(draft.imagePath)}&workspaceId=${workspaceId}`
                                    : "")
                                }
                                alt="Preview"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Upload
                                className="h-6 w-6 text-muted-foreground"
                                aria-hidden
                              />
                            )}
                          </div>
                          <div className="flex-1 space-y-2">
                            <div className="space-y-0.5">
                              <p className="text-sm font-medium">Image</p>
                              <p className="text-xs text-muted-foreground">
                                Upload a PNG or JPG logo.
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => imageInputRef.current?.click()}
                                className="h-8"
                              >
                                {draft.imagePreview || draft.imagePath
                                  ? "Replace"
                                  : "Choose file"}
                              </Button>
                              <input
                                ref={imageInputRef}
                                type="file"
                                accept="image/png,image/jpeg,image/webp"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0] ?? null;
                                  void handleImageChange(file);
                                  e.target.value = "";
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {resolvedContentType !== "text" ? (
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Label className="text-xs font-normal text-muted-foreground">
                            Image size
                          </Label>
                          <span className="font-mono text-xs">
                            {Math.round(resolvedImageSizePt)}pt
                          </span>
                        </div>
                        <Slider
                          min={24}
                          max={600}
                          step={12}
                          value={[resolvedImageSizePt]}
                          onValueChange={(vals) =>
                            handleDefinitionChange({
                              imageWidthPt: vals[0],
                              imageHeightPt: vals[0],
                            })
                          }
                        />
                      </div>
                    ) : null}

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Label className="text-xs font-normal text-muted-foreground">
                            Opacity
                          </Label>
                          <span className="font-mono text-xs">
                            {Math.round(
                              (draft.definition.opacity ?? 0.65) * 100,
                            )}
                            %
                          </span>
                        </div>
                        <Slider
                          min={0.1}
                          max={1}
                          step={0.05}
                          value={[draft.definition.opacity ?? 0.65]}
                          onValueChange={(vals) =>
                            handleDefinitionChange({ opacity: vals[0] })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Label className="text-xs font-normal text-muted-foreground">
                            Font size
                          </Label>
                          <span className="font-mono text-xs">
                            {draft.definition.fontSize?.toFixed(1) ?? "1.6"}rem
                          </span>
                        </div>
                        <Slider
                          min={0.8}
                          max={4}
                          step={0.1}
                          value={[draft.definition.fontSize ?? 1.6]}
                          onValueChange={(vals) =>
                            handleDefinitionChange({ fontSize: vals[0] })
                          }
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-2">
                      <Label htmlFor="wm-color">Color</Label>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground uppercase">
                          {draft.definition.color ?? "#4B5563"}
                        </span>
                        <Input
                          id="wm-color"
                          type="color"
                          value={(
                            draft.definition.color ?? "#4B5563"
                          ).toUpperCase()}
                          onChange={(e) =>
                            handleDefinitionChange({ color: e.target.value })
                          }
                          className="h-8 w-12 border-none bg-transparent p-0.5 shadow-none"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Layout Section */}
                  <div className="space-y-3 md:col-span-1">
                    <h4 className="text-sm font-medium tracking-tight">
                      Layout
                    </h4>
                    <div className="space-y-2">
                      <Label>Pattern style</Label>
                      <Select
                        value={resolvedPattern}
                        onValueChange={(v) => {
                          const nextPattern = v as WatermarkPattern;
                          const nextDefaultRotation =
                            nextPattern === "diagonal_grid" ? -40 : 0;
                          const prevDefaultRotation =
                            resolvedPattern === "diagonal_grid" ? -40 : 0;
                          const currentRotation = draft.definition.rotationDeg;

                          handleDefinitionChange({
                            pattern: nextPattern,
                            rotationDeg:
                              typeof currentRotation === "number"
                                ? currentRotation === prevDefaultRotation
                                  ? nextDefaultRotation
                                  : currentRotation
                                : nextDefaultRotation,
                          });
                        }}
                      >
                        <SelectTrigger className="bg-background">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PatternOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-4 pt-1">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <Label className="text-xs font-normal text-muted-foreground">
                            Rotation
                          </Label>
                          <span className="font-mono text-xs">
                            {resolvedRotationDeg}°
                          </span>
                        </div>
                        <Slider
                          min={-90}
                          max={90}
                          step={5}
                          value={[resolvedRotationDeg]}
                          onValueChange={(vals) =>
                            handleDefinitionChange({ rotationDeg: vals[0] })
                          }
                        />
                      </div>

                      {resolvedPattern === "single" ? null : (
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Label className="text-xs font-normal text-muted-foreground">
                              Grid spacing
                            </Label>
                            <span className="font-mono text-xs">
                              {draft.definition.xSpacing ?? 320}pt
                            </span>
                          </div>
                          <Slider
                            min={100}
                            max={800}
                            step={20}
                            value={[draft.definition.xSpacing ?? 320]}
                            onValueChange={(vals) => {
                              const val = vals[0];
                              handleDefinitionChange({
                                xSpacing: val,
                                ySpacing: val,
                              });
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dynamic Preview Section - moved under Appearance */}
                  <div className="space-y-3 md:col-span-1">
                    <div className="space-y-2 rounded border border-border/70 bg-background/35 p-3">
                      <div className="space-y-0.5">
                        <h4 className="text-xs font-semibold text-foreground">
                          Dynamic Preview
                        </h4>
                        <p className="text-[10px] text-muted-foreground">
                          Simulate viewer data (preview only).
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label
                              className="cursor-pointer text-[10px] font-medium"
                              onClick={() =>
                                setPreviewDynamicEmailEnabled(
                                  !previewDynamicEmailEnabled,
                                )
                              }
                            >
                              Simulate Email
                            </Label>
                            <Switch
                              checked={previewDynamicEmailEnabled}
                              onCheckedChange={setPreviewDynamicEmailEnabled}
                              className="origin-right scale-[0.6]"
                            />
                          </div>
                          {previewDynamicEmailEnabled && (
                            <Input
                              value={previewEmail}
                              onChange={(e) => setPreviewEmail(e.target.value)}
                              placeholder={DEFAULT_PREVIEW_EMAIL}
                              className="h-7 bg-muted/30 text-xs"
                            />
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label
                              className="cursor-pointer text-[10px] font-medium"
                              onClick={() =>
                                setPreviewDynamicIpEnabled(
                                  !previewDynamicIpEnabled,
                                )
                              }
                            >
                              Simulate IP
                            </Label>
                            <Switch
                              checked={previewDynamicIpEnabled}
                              onCheckedChange={setPreviewDynamicIpEnabled}
                              className="origin-right scale-[0.6]"
                            />
                          </div>
                          {previewDynamicIpEnabled && (
                            <Input
                              value={previewIp}
                              onChange={(e) => setPreviewIp(e.target.value)}
                              placeholder={DEFAULT_PREVIEW_IP}
                              className="h-7 bg-muted/30 text-xs"
                            />
                          )}
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label
                              className="cursor-pointer text-[10px] font-medium"
                              onClick={() => {
                                const next = !previewDynamicDateTimeEnabled;
                                setPreviewDynamicDateTimeEnabled(next);
                                if (next) {
                                  setPreviewDateTime(new Date().toISOString());
                                }
                              }}
                            >
                              Simulate Date &amp; Time
                            </Label>
                            <Switch
                              checked={previewDynamicDateTimeEnabled}
                              onCheckedChange={(next) => {
                                setPreviewDynamicDateTimeEnabled(next);
                                if (next) {
                                  setPreviewDateTime(new Date().toISOString());
                                }
                              }}
                              className="origin-right scale-[0.6]"
                            />
                          </div>
                          {previewDynamicDateTimeEnabled && (
                            <Input
                              value={previewDateTime}
                              onChange={(e) =>
                                setPreviewDateTime(e.target.value)
                              }
                              placeholder={new Date().toISOString()}
                              className="h-7 bg-muted/30 text-xs"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div
                className="relative z-0 flex min-h-[320px] min-w-0 flex-1 shrink-0 flex-col bg-muted/[0.18] lg:border-l lg:border-border/60"
                data-guide="branding-watermark-preview"
              >
                <div className="relative flex flex-1 items-center justify-center overflow-hidden p-4">
                  {/* Paper background with instant watermark preview */}
                  <div className="relative aspect-[1/1.414] w-full max-w-[500px] overflow-hidden rounded-sm bg-white [box-shadow:var(--dk-shadow-dialog)]">
                    {previewWatermarkOverlay ? (
                      <WatermarkTemplatePreviewPdf
                        pdfUrl="/dummy-pdf.pdf"
                        watermarkOverlay={previewWatermarkOverlay.overlay}
                        definition={previewWatermarkOverlay.definition}
                        dynamicValues={previewWatermarkOverlay.dynamicValues}
                        imageUrl={previewWatermarkOverlay.imageUrl}
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-muted-foreground italic">
                        {previewError ||
                          "Configure settings to generate preview"}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t border-border/60 bg-muted/[0.12] p-4">
              <Button
                type="button"
                variant="ghost"
                onClick={closeEditor}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={() => void saveTemplate()} disabled={saving}>
                {saving ? "Saving Template…" : "Save Template"}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default WatermarkTemplatesManager;
