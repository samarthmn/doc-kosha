# Self-hosting DocKosha

Self-hosting is not currently available to external users. The DocKosha source
is public under AGPL-3.0-or-later for reading, review, and contribution, but this
repository is not presently a runnable self-hosting distribution: the
mandatory direct DocYantra `0.0.26` dependency is private and unavailable
externally.

There is no external DocYantra package access, token, SDK, API, standalone
product, or engine-license offering. Use [DocKosha Cloud](https://dockosha.com)
for the available hosted product. Enterprise terms require a separate signed
agreement; contact [contact@dockosha.com](mailto:contact@dockosha.com).

A future self-hosting path may document an independently configured provider
such as Gotenberg, but no alternative provider is supported or promised today.

Read [the conversion envelope](../docs-site/content/docs/how-it-works/conversion-envelope.mdx) before
investing time in document conversion. The mandatory direct DocYantra `0.0.26`
dependency supports the documented PDF, Office, CSV/Markdown, watermark,
page-counting, and redaction paths; work outside that envelope returns a typed
`unsupported_feature` failure.

## Future operator reference (maintainer-only)

You own the database, migrations, backups and restore tests, object storage and
its CORS/lifecycle rules, secrets, TLS and reverse proxy, SMTP deliverability,
upgrades, monitoring, capacity, and the legal obligations for the documents
you store. The project does not provide an SLA or remote access to your
deployment.

## Maintainer-only prerequisites

- Node.js 24.x
- pnpm 11.25.0
- Docker
- Supabase CLI

## Maintainer-only development prerequisites

From a clean checkout, an authorized project maintainer must provision the
private DocYantra dependencies through the project’s internal process. This
page intentionally does not provide token instructions or a request path for
external users.

The internal development stack, environment values, and service setup are
available only through the maintainer process. Do not use this page to request
package access or credentials.

## Future production shape (not currently available externally)

Use a managed or operator-run Postgres/Supabase project, an S3-compatible
bucket with the CORS rules needed by the viewer, authenticated SMTP, and a
TLS-terminating reverse proxy or hosting platform. Set `NEXT_PUBLIC_APP_URL`
to the public origin and configure the server-only values in
[configuration](configuration.md).

Custom domains are an optional application capability. The app can boot without
Cloudflare settings; create, delete, DNS-record, and verification operations
return a clear 503 configuration error until the complete provider envelope is
present. No implicit DNS target is used.

## Document processing (Cloud and authorized maintainer environments)

Install the exact DocYantra `0.0.26` dependency declared by the application.
Its validated conversion envelope is authoritative; unsupported work fails
closed and there is no provider-selection variable or fallback converter.

## Upgrades and data safety

Read release notes, apply database migrations with the application change,
test a restore, and verify conversion and download behavior after upgrading.
Document-processing failures are typed. The viewer serves the original upload
when conversion does not complete, and required watermark failures block
delivery rather than sending unmarked bytes.
