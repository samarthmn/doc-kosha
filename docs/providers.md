# Document-processing providers

This page describes the public provider contract and the provider used by
DocKosha Cloud. The DocYantra implementation is private and unavailable to
external users; no standalone provider package, SDK, API, or self-hosting
installation is offered.

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

DocYantra is the mandatory private direct `0.0.25` dependency. It implements the
document-processing contract for PDF and Office conversion, merge, watermark,
page count, and redaction. Its validated size, format, and fidelity envelope is
authoritative: unsupported work returns a typed failure and never falls back to
another provider or a degraded converter.

## Fail-closed behavior

Before every call, the facade checks the provider's capability set. An absent
operation returns a typed `unsupported_feature` result without invoking the
provider. A conversion failure serves the original file; a converted asset is
selected only after a completed conversion. Watermarks must be burned into the
delivered PDF bytes, and a required watermark failure blocks delivery rather
than releasing unmarked bytes.
