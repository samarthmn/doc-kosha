import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import { applyWatermarkToPdf } from "@/server/watermarkService";
import type { WatermarkDefinition } from "@/lib/branding";
import {
  type WatermarkTemplateDefinition,
  materializeWatermark,
} from "@/lib/watermarks";
import { BRANDING_ASSETS_BUCKET_NAME } from "@/lib/constants";
import type { Json } from "@/types/generated/supabase";
import { downloadToBuffer } from "@/server/storage";
import {
  engineFailureSchema,
  toPublicEngineErrorResponse,
} from "@/server/engineErrors";

const RequestSchema = z.object({
  workspaceId: z.string().uuid(),
  template: z.object({
    id: z.string().optional().nullable(),
    name: z.string().optional().nullable(),
    definition: z.custom<WatermarkTemplateDefinition>(),
    imagePath: z.string().optional().nullable(),
  }),
  dynamic: z
    .object({
      email: z.string().max(254).optional().nullable(),
      ip: z.string().max(64).optional().nullable(),
    })
    .optional()
    .nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = RequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const { workspaceId, template, dynamic } = parsed.data;
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: workspace, error: workspaceError } = await supabase
      .from("workspaces")
      .select("created_by")
      .eq("id", workspaceId)
      .maybeSingle();
    if (workspaceError) {
      console.error("[watermarks.preview] workspace lookup failed", {
        error: workspaceError,
        workspaceId,
        userId: user.id,
      });
      return NextResponse.json({ error: "Server error" }, { status: 500 });
    }
    const isOwner = workspace?.created_by === user.id;
    if (!isOwner) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const materialized = materializeWatermark({
      id: template.id ?? "preview-id",
      name: template.name ?? "Preview watermark",
      definition: template.definition as unknown as Json,
      image_storage_path: template.imagePath ?? null,
    });
    if (!materialized) {
      return NextResponse.json(
        { error: "Watermark definition is incomplete" },
        { status: 400 },
      );
    }

    const dummyPdfPath = join(process.cwd(), "public", "dummy-pdf.pdf");
    const dummyPdf = await readFile(dummyPdfPath);

    let imageBytes: ArrayBuffer | Uint8Array | null = null;
    let imageMimeType: string | undefined;
    let imageName: string | undefined;

    if (template.definition.imageDataUrl) {
      const match = template.definition.imageDataUrl.match(
        /^data:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/,
      );
      if (match?.[2]) {
        // Buffer is a Uint8Array; avoid using `.buffer` due to byteOffset pooling.
        imageBytes = Buffer.from(match[2], "base64");
        imageMimeType = match[1] || "image/png";
        imageName = "watermark-image";
      }
    } else if (template.imagePath) {
      // Download from R2
      const downloadResult = await downloadToBuffer({
        logicalBucket: BRANDING_ASSETS_BUCKET_NAME,
        path: template.imagePath,
      });
      if (!downloadResult.ok) {
        console.error(
          "[watermark preview] image download failed",
          downloadResult.message,
        );
      } else {
        // Buffer is a Uint8Array; pass through directly.
        imageBytes = downloadResult.buffer;
        imageMimeType = downloadResult.contentType || undefined;
        imageName = template.imagePath.split("/").pop() ?? "watermark-image";
      }
    }

    const def: WatermarkDefinition = {
      ...materialized.definition,
      pattern: materialized.pattern,
      rotationDeg: materialized.rotationDeg,
      xSpacing: materialized.xSpacing,
      ySpacing: materialized.ySpacing,
      mode: materialized.mode,
      imageWidthPt: materialized.imageWidthPt ?? undefined,
      imageHeightPt: materialized.imageHeightPt ?? undefined,
      imagePath: materialized.imageStoragePath ?? undefined,
    };

    const dynamicValues =
      dynamic && (dynamic.email || dynamic.ip)
        ? {
            ...(dynamic.email?.trim() ? { email: dynamic.email.trim() } : {}),
            ...(dynamic.ip?.trim() ? { ip: dynamic.ip.trim() } : {}),
          }
        : undefined;

    const result = await applyWatermarkToPdf({
      sourcePdf: dummyPdf,
      definition: def,
      dynamicValues,
      imageBytes: imageBytes ?? undefined,
      imageContentType: imageMimeType,
      imageFileName: imageName,
    });

    if (!result.ok) {
      console.error("[watermarks.preview] render failed", {
        code: result.code,
        operation: result.operation,
      });
      const publicFailure = toPublicEngineErrorResponse(result);
      return NextResponse.json(publicFailure.body, {
        status: publicFailure.status,
      });
    }

    return new NextResponse(result.pdf, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="watermark-preview.pdf"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const parsedFailure = engineFailureSchema.safeParse(error);
    if (parsedFailure.success) {
      const publicFailure = toPublicEngineErrorResponse(parsedFailure.data);
      return NextResponse.json(publicFailure.body, {
        status: publicFailure.status,
      });
    }
    console.error("[watermarks.preview] unexpected error", error);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
