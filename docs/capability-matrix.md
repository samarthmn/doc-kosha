# DocKosha capability matrix

DocKosha has one public source edition. The repository is
licensed under the **GNU Affero General Public License, version 3
(AGPL-3.0-or-later)**. Enterprise licensing is available only through a separate
signed agreement; see [Commercial Licensing](../COMMERCIAL-LICENSING.md).
DocKosha Cloud is the available managed product. External self-hosting is not
currently available because DocYantra is a private mandatory direct `0.0.26`
dependency. No DocYantra package, SDK, API, standalone product, or license is
offered externally.

## Application capabilities

These capabilities are ordinary application modules in this repository:

- Password, email-OTP, expiry, revocation, open-once, allowlist, and blocklist
  link gates
- Data rooms with room, folder, and document access lists
- NDA gates, comments, viewer feedback, and Q&A
- Static and dynamic server-side watermarking and download controls
- Redaction workflows and owner audit logs
- Viewer analytics, including page views, time, downloads, country aggregates,
  and exports where the product exposes them
- Document version history and owner-configured retention from 1 to 20 prior
  versions
- User groups, group-based access, custom domains, and branding controls

Cloud plans can limit capacity or charge for hosted operations. A billing plan
does not move application capability into a separate source edition.

## Document-processing capability

DocKosha Cloud and authorized maintainer builds use the mandatory private
DocYantra dependency:

| Operation           | DocYantra status                                     |
| ------------------- | ---------------------------------------------------- |
| `merge`             | Supported within the validated PDF envelope          |
| `watermark`         | Supported for server-side PDF watermark burn-in      |
| `csv`               | Supported within the validated CSV-to-PDF envelope   |
| `page_count`        | Supported for PDFs                                   |
| `probe`             | Supported as an in-process health probe              |
| `markdown`          | Supported within the validated Markdown envelope     |
| `office_conversion` | Supported for the documented DOCX/PPTX/XLSX envelope |
| `redaction`         | Supported with fail-closed content removal           |

DocYantra's package and capability validation fail closed. There is no provider
selection variable or fallback provider.

Every provider must enforce its validated size, format, and fidelity envelope.
Unsupported work returns a typed failure. Conversion failures serve the
original upload rather than a partial rendering.
