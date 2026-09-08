# `@dockosha/provider-interface`

`@dockosha/provider-interface` is the runtime-independent contract between
DocKosha and a document-processing provider. It defines the stable operation
and error inventories, result envelopes, and method signatures used for PDF
merge and watermarking, page inspection, CSV conversion, optional Markdown and
Office conversion, redaction, and provider probes.

This package is covered by the root
[AGPL-3.0-or-later license](../../LICENSE). Enterprise licensing is available only
through a separate signed agreement. A
provider declares its supported operations through `capabilities`, and callers
must handle the typed `unsupported_feature` failure for operations outside the
declared envelope.

DocYantra is the mandatory direct `0.0.25` implementation for the application.
It supports the documented PDF and Office operations and returns typed failures
outside its validated envelope; there is no provider-selection environment
variable or fallback provider.

Implementations must enforce their own safety, resource, and fidelity limits
and return typed failures rather than silently omitting document content.
