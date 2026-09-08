# Contributing

Contributions should improve the one public DocKosha repository’s application,
documentation, or its tests without weakening its security and fail-closed
behavior.

## Before opening a change

1. Read [AGENTS.md](./AGENTS.md), the relevant document in `docs/`, and the
   existing tests for the area.
2. Authorized project maintainers should install Node.js 24.x and pnpm, then
   run `pnpm install`; external contributors can review and propose source
   changes without a runnable installation.
3. Run the focused checks for the change and the full checks listed in the
   [README](./README.md) when practical.
4. Do not include credentials, customer data, populated environment files, or
   generated build output.

Keep route files thin, validate IO at boundaries, preserve the provider's
typed failures, and document any capability limit instead of silently
degrading it.

## Commit checks

The repository uses Husky, lint-staged, ESLint, and Prettier. `pnpm install`
activates the Git hooks through the `prepare` script. If dependencies are
already installed, run `pnpm prepare` to activate or repair the hooks.

Before each commit, the hook runs `pnpm lint-staged`, `pnpm lint:fix`, and
`pnpm typecheck`. Staged JavaScript or TypeScript files trigger the full
type check, lint fixes with zero warnings allowed, and formatting fixes.
Staged JSON, Markdown, stylesheets, HTML, or YAML files trigger formatting
fixes. These fix commands run across the repository, so review any resulting
changes before committing again. A failed check blocks the commit.

Use `pnpm format` to check formatting or `pnpm format:fix` to apply it manually.

Some Cursor versions disable Git hooks for Source Control commits by overriding
`core.hooksPath` to `/dev/null`. In that case, commit from a terminal with
`git commit` so Husky runs. To verify the hook without creating a commit, run
`git hook run pre-commit`; this runs the same checks and may apply fixes.

## Branch and release workflow

Use `staging` as the GitHub default branch and the base for feature branches
and contribution PRs. Reserve `main` for verified production releases.

1. Create a feature branch from `staging` and open its PR against `staging`.
2. After review and required checks, merge the PR into `staging`. Once the
   Vercel Git integration is configured, this deploys to `staging.dockosha.com`.
3. Verify the changes on staging, then open a release PR from `staging` to
   `main`. Use a merge commit for this release PR to preserve shared history.
4. Merging the release PR triggers the production build and deployment to
   `www.dockosha.com` once the Git integration is configured.

Protect both branches with PR review and required checks. If an emergency fix
is released through a PR directly to `main`, merge `main` back into `staging`
before continuing development. The licensing and CLA gate below still applies
to contributions targeting `staging`.

See [Maintainer Vercel deployments](./docs/vercel-deployment.md) for branch,
domain, environment, and release-check configuration.

## Licensing and CLA gate

DocKosha is licensed under AGPL-3.0-or-later. Before an outside contribution can be
merged, the project must have an approved and activated CLA workflow. Until
that workflow is active, contributions are accepted only from the copyright
owner or an authorized representative under a separately documented written
arrangement; an issue comment, pull-request checkbox, or this file is not a
signature. See the [approved CLA templates](./legal/cla/README.md).

The template texts are approved, but the acceptance workflow is not active. Do not submit a
contribution that relies on a future commercial relicensing right until the
project publishes the activated workflow and confirms the applicable agreement.
Do not submit third-party code without confirming that its license permits the
proposed use and preserving its notices.
