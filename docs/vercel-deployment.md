# Maintainer Vercel deployments

This guide is for authorized DocKosha Cloud maintainers. Public source access
does not grant access to the private DocYantra packages or production services.

## Git integration

Use Vercel's existing production project and connect it to
`samarthmn/doc-kosha`. The Vercel GitHub app must have access to that repository
under the `samarthmn` account. Access to a previous organization's repository
does not grant access to this repository.

Set GitHub's default branch to `staging` so new contribution PRs normally
target it. Explicitly set Vercel's production branch to `main`; this setting
is separate from GitHub's default branch. Keep the project root at the
repository root and retain the existing production domains and environment
variables.

Assign `staging.dockosha.com` to the `staging` Git branch using the preview
environment and staging service credentials. Keep the production domains and
production service credentials assigned to `main` through Vercel's production
environment. Protect both branches with PR review and required checks.
Keep Git fork protection enabled so outside pull requests require maintainer
authorization before Vercel runs their code with private dependencies.

Once connected, feature PRs merge into `staging` and automatically update the
staging website. After verification there, open a release PR from `staging`
to `main`. Merge that PR with a merge commit to preserve shared history;
Vercel then builds the production release and a successful deployment replaces
the production site. Merge any emergency production fixes back into `staging`.
See the [contribution workflow](../CONTRIBUTING.md#branch-and-release-workflow).

Other branches use preview deployments. A separate GitHub Actions deployment
workflow and a GitHub Actions Vercel token are unnecessary for this setup.

Public GitHub CI checks the source boundary and release tooling. The full
maintainer application jobs are separately protected, manually dispatched,
and restricted to GitHub's default branch. With `staging` configured as the
default, run these checks on `staging` before opening the production release
PR. Ensure the `maintainer-engine-ci` environment permits that branch while
retaining its approval protections. A green public CI run alone does not
certify an application build.

## Build settings

Use the Next.js framework preset and Node.js `24.x`. The repository pins pnpm
`11.25.0` and DocYantra `0.0.25`. Its workspace configuration selects the
private package registry and the hoisted dependency layout required by the
Vercel function packager.

Configure this install command in the Vercel project:

```sh
test -n "$GITHUB_PACKAGES_TOKEN" && npm install --global pnpm@11.25.0 && npm config set --location=user "//npm.pkg.github.com/:_authToken" "$GITHUB_PACKAGES_TOKEN" && pnpm install --frozen-lockfile
```

Configure this build command:

```sh
pnpm build && node scripts/verify-engine-build-artifact.mjs
```

The final verification requires the document engine, fonts, and runtime files
to be present in the server bundle. A missing private package or incomplete
bundle must fail the build.

Store `GITHUB_PACKAGES_TOKEN` as a sensitive Vercel environment variable for
authorized production and preview builds. It must have read access to the
required private packages. Keep credentials out of source files, build logs,
and public CI. Maintain and rotate this credential through the private
maintainer process.

## Release checks

Before merging a release PR from `staging` into `main`, verify the staging
deployment, run the checks documented in the README, and verify any new
database migrations against the production migration history.
Vercel application builds do not apply database migrations. Database changes
require separate, explicit authorization and verification.

Validate the first Vercel build from the new Git connection: confirm the
repository and commit, the pinned package manager, the engine bundle check,
and a `READY` deployment. Exercise the rendered application before promoting
a preview or sending a production release. Retain the previous production
deployment ID for rollback in the private operating record.

The existing preview environment uses `staging.dockosha.com` as its canonical
app origin. Ordinary page requests to a unique preview URL therefore redirect
to that host. Confirm which deployment the staging domain serves before using
it as evidence that a new preview's UI works; a successful build alone is not
an end-to-end product test.
