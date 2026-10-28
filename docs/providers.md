# Document-processing providers

This page describes the public provider contract and DocYantra, the provider
every DocKosha build uses. DocYantra is open source under AGPL-3.0-or-later at
[github.com/samarthmn/doc-yantra](https://github.com/samarthmn/doc-yantra), and
its packages install from GitHub Packages.

DocKosha delegates document processing to a provider behind the
`@dockosha/provider-interface` contract. A provider declares an `id`, a
capability set, and methods that return either a success envelope or a typed
failure. Callers treat the declared capability set as authoritative.

## Contract operations

The public contract lists these operations:

| Operation           | Method                | Purpose                                  |
| ------------------- | --------------------- | ---------------------------------------- |
| `merge`             | `mergeAndWatermark`   | Merge PDF inputs                         |
| `watermark`         | `mergeAndWatermark`   | Burn a watermark into PDF output         |
| `csv`               | `csvToPdf`            | Convert CSV to PDF                       |
| `markdown`          | `markdownToPdf`       | Convert Markdown to PDF                  |
| `office_conversion` | `officeToPdf`         | Convert DOCX, PPTX, XLSX, or XLSM to PDF |
| `redaction`         | `redactPdfWithReport` | Remove PDF content and return warnings   |
| `page_count`        | `pageCount`           | Count PDF pages                          |
| `probe`             | `probe`               | Check provider availability              |

Provider failures carry a stable code, message, operation, optional format,
retryability, and structured detail. The code inventory includes
`invalid_input`, `unsupported_format`, `unsupported_feature`, `missing_glyph`,
`missing_asset`, `password_protected`, `malformed_container`,
`resource_limit`, `invalid_output`, `internal_error`, `deadline_exceeded`,
`queue_busy`, `worker_boot_failed`, `engine_unavailable`, `trap`, and
`protocol_error`.

## DocYantra provider

DocYantra is the mandatory direct `0.0.28` dependency. It implements the
document-processing contract for PDF and Office conversion, merge, watermark,
page count, and redaction. Its validated size, format, and fidelity envelope is
authoritative: unsupported work returns a typed failure and never falls back to
another provider or a degraded converter.

The `0.0.26` release adds bounded legacy Excel Notes and validated glyph bounds
for embedded static TrueType CID fonts using Identity-H with an explicit
Identity CIDToGIDMap. Plain rectangular Notes follow visibility and print
settings; unsupported drawings, controls, embedded objects, and relationships
still fail closed. Other supported PDF font mappings retain conservative bounds,
and redaction can still require removal beyond a selection with confirmation.

The `0.0.28` release relicenses DocYantra under AGPL-3.0-or-later, the same
license as DocKosha. It has no functional changes from `0.0.27`.

The `0.0.27` release follows Word's line metrics more closely. Calibri-family
line heights no longer count the font's leading twice, and each character uses
the font Word assigns to its script, so `w:eastAsia` and theme East Asian fonts
apply to Chinese, Japanese, and Korean text while Latin text keeps its Latin
font. MingLiU body text at 12 pt uses Word's measured line height. Converted
documents keep Word's pagination more closely; the supported envelope is
unchanged.

## Fail-closed behavior

Before every call, the facade checks the provider's capability set. An absent
operation returns a typed `unsupported_feature` result without invoking the
provider. A conversion failure serves the original file; a converted asset is
selected only after a completed conversion. Watermarks must be burned into the
delivered PDF bytes, and a required watermark failure blocks delivery rather
than releasing unmarked bytes.
