# DocKosha

DocKosha is a secure document-sharing and virtual data-room application. It
provides password and email-OTP gates, allowlists and blocklists, NDA gates,
expiry and revocation, server-side watermarking, DocYantra-backed redaction,
document versioning, viewer analytics, comments, Q&A, and audit trails.

This repository is licensed under the [GNU Affero General Public License,
version 3 (AGPL-3.0-or-later)](./LICENSE). Enterprise licensing is available only
through a separate signed agreement; see [Commercial Licensing](./COMMERCIAL-LICENSING.md).
Read the [trademark guidance](./TRADEMARKS.md) before redistributing a fork.

DocKosha has one public source edition. DocKosha Cloud is the managed service
operated by Sublime Innovation Technologies Limited. The source is published
for reading, review, and contribution; it is not currently a runnable
self-hosting distribution because its mandatory DocYantra `0.0.26`
dependency is private and unavailable to external users.

## Maintainer-only development prerequisites

- Node.js 24.x
- pnpm 11.25.0
- Docker, for the local Supabase and MinIO services
- Supabase CLI, for the local database and migrations

These prerequisites apply only to authorized project maintainers. They do not
make the public source an externally runnable distribution.

## Quickstart

The public repository does not currently provide an external installation or
self-hosting quickstart. You can inspect the source and contribute under the
AGPL-3.0-or-later terms. The application’s internal maintainer development install
requires authorized access to private DocYantra packages; those packages,
tokens, SDKs, APIs, and licenses are not offered to external users.

See [DocKosha Cloud](https://dockosha.com) for the available hosted product.

The maintainer-only development setup and provider configuration are documented
for authorized project maintainers; they are not an access path for external
installation.

## Public source checks

These checks do not require private packages or runtime credentials:

The public checks require Node.js 24.x. The Gitleaks check also requires the
official pinned Gitleaks 8.30.1 binary used by the public workflow.

```bash
node scripts/check-public-manifest.mjs --mode=check
node scripts/check-public-manifest.mjs --mode=check --source=committed
node --test scripts/audit-tools.test.mjs scripts/license-audit.test.mjs scripts/release-references.test.mjs
node scripts/check-release-references.mjs
node scripts/run-gitleaks.mjs
node scripts/run-gitleaks.mjs --source=committed
```

Manifest and secret audits default to `--source=export`, the filtered current
working tree. `--source=candidate` strictly rejects non-public paths without
reading ignored credential buffers; `--source=committed` reads immutable HEAD
tree/blob data. These checks use only Node's built-in modules (apart from the
pinned Gitleaks executable), so the public CI job does not install packages.

## Maintainer-only application checks

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

The following full application checks require the authorized internal
development environment and private DocYantra packages. For the full local
browser suite, start the local services and run
`pnpm e2e`. Database tests use `supabase test db --local`.

## Documentation and support

- [Architecture](./docs/architecture.md)
- [Configuration](./docs/configuration.md)
- [Providers](./docs/providers.md)
- [Capability matrix](./docs/capability-matrix.md)
- [Self-hosting](./docs/self-hosting.md)
- [Testing](./testing-docs/TESTING.md)
- [Maintainer Vercel deployments](./docs/vercel-deployment.md)
- [Documentation site](./docs-site/README.md)
- [Contributing](./CONTRIBUTING.md)
- [Security reports](./SECURITY.md)
- [Support](./SUPPORT.md)
- [License](./LICENSE)
- [Commercial licensing](./COMMERCIAL-LICENSING.md)
- [Contributor License Agreements](./legal/cla/README.md)
- [Trademarks](./TRADEMARKS.md)
- [Third-party notices](./THIRD_PARTY_NOTICES.md)

Community support covers source review and contribution questions. Hosted
DocKosha Cloud support follows the customer's service agreement. There is no
self-hosting support or external DocYantra access at this time.
