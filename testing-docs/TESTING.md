# Testing DocKosha

DocKosha has one public unit suite and one default Playwright suite. Independent
tests remain with the public application source. Tests that depend on the 49
downloaded samples and their dependent tests live outside this repository in
the private local companion; authorized maintainers run them through the
private companion repository. There is no private DocKosha application mirror.

Application installation and full application/engine tests in this document
are for authorized project maintainers only. External users should use the
credential-free public source checks listed in the README.

## Local prerequisites

- Node.js 24.x
- pnpm 11.25.0
- Docker and the Supabase CLI for database and browser flows
- A local `.env.local` based on `env.example`; never commit it

Install dependencies and start the local services:

```bash
pnpm install
pnpm dev:backend:up
```

## Commands

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:audit-tools
pnpm build
pnpm e2e
supabase test db --local
```

`pnpm e2e` runs the unit suite and the default Playwright suite. Playwright
uses `PLAYWRIGHT_BASE_URL`, defaulting to `http://localhost:3000`, and reads
test mail from `MAILPIT_BASE_URL`, defaulting to `http://localhost:54324`.
Default engine discovery and Playwright discovery exclude sample-dependent
tests. Maintainers with `doc-kosha-private` use its documented sample-test
entry points; missing fixtures or private packages are errors, not skips.

## Unit coverage

Unit tests cover the application contracts that do not need a browser or a
database, including:

- access gates, link resolution, expiry, revocation, one-time-open behavior,
  allowlists, blocklists, and NDA state;
- workspace membership, roles, entitlement checks, billing calculations, free
  plan limits, bandwidth, storage, and document-version retention;
- upload conflict resolution, conversion claims, original-file fallback,
  downloads, watermarking, redaction, and typed engine errors;
- privacy-first analytics, consent, replay exclusions, HTTP-only cookies, and
  public-link identity handling;
- accessibility and layout contracts for authentication, onboarding, viewers,
  settings, public gates, comments, Q&A, and responsive navigation;
- provider capability checks, fail-closed unsupported operations, bounded
  inputs, and generated PDF metadata; and
- docs, license, manifest, and audit-tool contracts where an existing test
  already covers them.

Preserve existing tests when changing implementation. Repoint an assertion
when a public name or path changes; do not add a new test case merely to
replace a stale edition label.

## Playwright coverage

The default browser suite uses a local Supabase database, local object storage,
and Mailpit. It covers sign-in, onboarding, workspace and data-room access,
uploads, document viewing, public links and gates, watermark/download controls,
analytics, comments, Q&A, billing and plan limits, versioning, settings, custom
domains, notifications, and responsive accessibility behavior.

Use isolated workspaces and small generated fixtures. Do not use customer data,
external conversion services, or real credentials. The private sample suite is
the sole exception to the default suite's fixture rule and requires authorized
private provider access. Generated fixtures and screenshots belong under the
repository `tmp/` directory and must be removed after the run.

## Database tests

Run `supabase test db --local` against the local stack. Database tests should
assert RLS, ownership, membership, document and link access, retention,
analytics privacy, and storage metadata. Apply all migrations before running
the suite; a partially migrated database is not a valid test environment.

## Provider expectations

DocYantra is the mandatory private direct `0.0.25` dependency and handles the
document-processing operations within its validated envelope. Package and
capability failures must produce typed failures and fail closed; there is no
provider-selection variable or fallback provider.

Every document-processing test must assert the typed result or the documented
original-file fallback. Never accept a partial conversion, dropped visible
content, an unmarked watermarked download, or a redaction implemented only as
a visual cover.

## CI and review

Run the focused test for a changed area first, then the commands in the
[README](../README.md). CI uses synthetic local configuration and does not access
customer data or use engine package/source contents as fixtures or published
test artifacts; use synthetic documents instead. Authorized internal CI uses a
read-only token for the four private DocYantra packages on GitHub Packages only
for trusted maintainer checks; public source CI remains credential-free. The
same public repository workflow supports a manual `run_maintainer_engine`
opt-in, default false, protected by the `maintainer-engine-ci` environment and
restricted to GitHub's default branch (`staging` in the documented workflow).
The protected environment's branch rules must permit `staging` while retaining
its approval protections. Run the maintainer checks and verify the staging
deployment before merging a release PR from `staging` into `main`, which
triggers production deployment once Vercel's Git integration is configured.
See the [branch and release workflow](../CONTRIBUTING.md#branch-and-release-workflow).

A change is ready for review when the relevant focused checks and the full
public checks pass, the docs match the code, and no secrets or generated files
are included.
