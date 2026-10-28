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
operated by Sublime Innovation Technologies Limited. Both the application and
its document-processing engine are open source. Inspect the code, contribute,
or self-host at your own risk without official support. Its mandatory
DocYantra `0.0.28` dependency is open source under AGPL-3.0-or-later at
[github.com/samarthmn/doc-yantra](https://github.com/samarthmn/doc-yantra).

Source: [DocKosha](https://github.com/samarthmn/doc-kosha) ·
[DocYantra](https://github.com/samarthmn/doc-yantra) ·
[Public self-hosting overview](https://www.dockosha.com/self-hosting)

## Development prerequisites

- Node.js 24.x
- pnpm 11.25.0
- Docker, for the local Supabase and MinIO services
- Supabase CLI, for the local database and migrations

DocYantra's packages install from GitHub Packages, which requires a GitHub
personal access token (classic) with the `read:packages` scope in your
user-level npm configuration. See [Self-hosting](./docs/self-hosting.md).

The local R2 simulator (`pnpm r2:up`) builds pinned MinIO server and client
releases from upstream Go source because the community container images are no
longer available. The first start needs network access to pull the Go/Alpine
base images and download Go modules, and takes longer while compiling. Later
starts reuse Docker's build cache. Existing MinIO data stays in the same volume.

## Quickstart

Self-hosting is available at your own risk and is not officially supported.
[Self-hosting](./docs/self-hosting.md) covers installing DocYantra's packages,
the services you operate, and upgrades. [DocKosha Cloud](https://dockosha.com)
is the supported hosted product.

## Public source checks

These checks do not require DocYantra packages or runtime credentials:

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

## Application checks

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
```

The full application checks require the DocYantra packages and the local
services. For the full local browser suite, start the local services and run
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
DocKosha Cloud support follows the customer's service agreement. Self-hosting has no official support commitment. DocYantra is publicly
available; its GitHub Packages distribution requires authentication.
