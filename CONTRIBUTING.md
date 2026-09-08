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
