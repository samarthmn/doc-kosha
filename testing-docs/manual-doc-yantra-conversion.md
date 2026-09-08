# Manual test guide: package-only conversion and PDF processing

DocKosha performs document conversion, PDF merge/watermark, page counting, and redaction in the application process. A lockstep DocYantra release owns `@samarthmn/dockosha-provider-docyantra`, `@samarthmn/doc-yantra` (`pdf-core`), `@samarthmn/doc-yantra-office` (`office-core`), and `@samarthmn/doc-yantra-fonts`. There is no HTTP conversion-processing tier or alternate provider: DocYantra is the mandatory direct `0.0.25` dependency and its validated envelope is authoritative.

> **Authorized-maintainer reference only:** The DocKosha source is public for
> reading and contribution, but there is no public runnable installation. This
> guide documents trusted maintainer verification of the private DocYantra
> dependency; it is not a package-access, credential-request, or public engine
> release guide.

Use this guide after changing either package, a server adapter, conversion routing, output tracing, watermarking, or redaction.

## Prerequisites

- Run the app with the normal local Supabase and R2/MinIO stack.
- For authorized internal verification, pack the four DocYantra packages from the maintainer engine-development checkout and install those tarballs in a disposable DocKosha copy. Keep the packed core, office, fonts, and adapter versions identical; do not add them to this repository's tracked dependencies or lockfile, copy engine source into the public repository, or publish the artifacts.
- For authorized maintainer CI, install the exact pinned private packages through the existing internal registry process. External users do not receive registry credentials or package access.
- Use an entitled workspace for non-PDF conversion.
- Keep the samples in the private companion’s `mock-files/` folder and use its
  private test runners. Do not copy the samples into this repository.
- Do not configure a separate conversion service.

Before browser checks, run:

```bash
pnpm test:unit
pnpm typecheck
```

## Local packed-artifact setup

From the DocYantra checkout, build and pack the core, Office, and adapter packages without publishing. Record the version printed by each tarball and confirm they are lockstep. In a disposable DocKosha checkout, install those local tarballs for the direct-dependency gate, then run `pnpm test:engine`. DocYantra is mandatory; there is no provider-selection variable or fallback.

Install the matching fonts tarball in every scenario. Run `pnpm test:engine` and the build-artifact verification; this verifies the font manifest, checksums, and traced font files.

The engine runner fails closed when the provider package is absent or cannot be resolved. Missing worker/WASM/font assets, mixed package versions, incomplete Next traces, and undocumented skips are release blockers. The optional fonts path must not be silently treated as equivalent to the font-installed path.

## What to inspect

1. **First-use logs.** Ordinary startup stays lazy. After the explicit probe or first real operation, both `[pdf-core-wasm] worker loaded` and `[office-core-wasm] worker loaded` must appear. A probe error is a release blocker.
2. **Database telemetry.** Successful new conversions write only `pdf-core-wasm` or `office-core-wasm` to `conversion_engine`. Historical rows may retain retired engine strings and must remain readable.
3. **PDF metadata.** Office output contains the `office-core` producer. No new output may contain LibreOffice or Chromium/Skia producer fingerprints.
4. **Storage path.** A successful conversion publishes a claim-scoped immutable path only after validation.

## 1. Active formats convert in-process

Upload one real fixture for each active conversion type:

| Input                     | Expected engine    |
| ------------------------- | ------------------ |
| `.csv`, `.md`             | `pdf-core-wasm`    |
| `.docx`, `.pptx`, `.xlsx` | `office-core-wasm` |
| `.xlsm`                   | `office-core-wasm` |

Expected:

- `conversion_status` becomes `completed`.
- `converted_storage_path` is claim-scoped and ends in `.pdf`.
- The authenticated viewer renders the converted PDF.
- Public resolve and file routes use the converted PDF.
- `conversion_fallback_reason` is null for a clean success.

## 2. Package rejection fails cleanly

Upload the footnote-DOCX fixture created in `tests/e2e/document-conversion.spec.ts`, or another document that the Office profile rejects.

Expected:

- `conversion_status` becomes `failed`.
- No converted object is published.
- The viewer explains that preview is unavailable.
- Original download remains available and byte-identical.
- No LibreOffice-produced PDF appears.

Repeat with corrupt Office input. The request must finish with a clear failure; it must not hang or call a remote conversion service.

## 3. Size boundaries

- Upload a valid Office document just under 50 MiB: it should attempt and complete local conversion when its profile is supported.
- Submit 50 MiB + 1 byte through the conversion boundary: it should return `413` before copying bytes into WASM.
- Exercise a PDF merge whose aggregate input remains below 100 MiB: it should succeed.
- Exceed the 100 MiB merge ceiling: it should fail before engine work.

## 4. Unicode fonts

Create CSV and Markdown files containing Cyrillic text such as `Анна,Москва`.

Expected: both convert through `pdf-core-wasm`, with a valid PDF and no Chromium/Skia producer.

Create a CSV containing CJK text such as `名前,東京`.

Expected: conversion succeeds through `pdf-core-wasm` using the packaged, checksummed CJK fonts. Arabic, Devanagari, Thai, and monochrome emoji fixtures should also succeed when their glyphs are inside the shipped coverage.

For Office conversion, `@samarthmn/doc-yantra-fonts` supplies installed,
checksummed supplement assets and a manifest used to validate its shipped font
files. CJK Office files render horizontally with the packaged regional faces;
unsupported vertical text, ruby, and kinsoku-tuned line breaking still fail
closed and must not be treated as successful previews.

## 5. Merge and watermark

Test a one-page PDF and a multi-page PDF with:

- text watermark;
- Cyrillic text watermark;
- image watermark;
- merged download across two PDFs.

Expected:

- Output starts with `%PDF-` and parses successfully.
- Output page count equals the sum of source page counts.
- Cyrillic text succeeds through the registered server fonts.
- Missing required images, corrupt input, genuinely uncovered glyphs, and invalid output fail closed.
- A required watermark failure returns an error; raw source bytes are never substituted.

The browser preview keeps its WinAnsi gate because browser WASM has no runtime-registered fonts. Non-WinAnsi preview text may use the CSS overlay; server downloads must still use the authoritative PDF engine.

## 6. Redaction

Open a small text PDF in the authenticated redaction studio, select known text, and apply redaction.

Expected:

- `POST /api/documents/redaction` returns a valid PDF.
- `X-Redaction-Page-Count` matches the source page count.
- Covered text is removed rather than merely painted over.
- Unsupported PDF structures return a clear 4xx message that the PDF cannot be redacted.
- Engine unavailability returns 5xx and does not produce an output file.

Verify both “Replace current document” and “Save as new document” flows, including version-history behavior for replacement.

## 7. Deployment trace smoke test

Run a production-style build, start it, and repeat one CSV conversion, one Office conversion, one Cyrillic watermark, and one redaction. This catches missing `.wasm`, `fonts/manifest.json`, or manifest-listed font files in output tracing.

After a forced WASM trap in a disposable test process, invoke the engine again. The worker must be replaced and its cached font artifacts must be registered again before conversion resumes.

## Scope

This guide covers the two WASM packages, adapter boot probes, conversion routing, page counting, watermarking, and redaction. It does not replace upload, storage, viewer analytics, permission, or retention testing.
