# Contributing to DocKosha

DocKosha is one Next.js application edition. The repository is licensed under
AGPL-3.0-or-later; Enterprise licensing requires a separate signed agreement. Keep product
behavior, documentation, and tests aligned with the public code and its
documented provider envelope.

## Architecture

Use the App Router and keep route files thin. The dependency direction is:

```text
src/app -> src/modules -> src/server / src/lib
```

- `src/app/` contains route composition and API boundaries.
- `src/components/` contains reusable UI and layout components.
- `src/modules/<feature>/` owns feature behavior and server logic.
- `src/server/` contains framework-agnostic adapters and no React imports.
- `src/lib/` contains shared primitives, environment validation, and constants.

Validate client input, database writes, and external calls with Zod. Keep
server routes thin, protect service-role operations, and preserve row-level
security. Do not introduce cross-module imports or move domain logic into
routes.

## Document processing

DocYantra is the mandatory private direct `0.0.25` document-processing dependency.
It provides the validated PDF and Office operations; package and contract failures
must fail closed and must never silently fall back.

Conversion must not silently omit visible content. When conversion fails, the
viewer serves the original file. Required watermarking must fail closed rather
than release unmarked bytes. Redaction must remove content through a provider,
not cover it with a visual overlay.

## UI and accessibility

Use the existing shadcn/ui and Tailwind tokens. Preserve the supported themes,
responsive behavior, visible focus states, keyboard navigation, icon labels,
and reduced-motion behavior. Add loading, empty, and error states to new
flows. Do not change billing, entitlement, storage, API, or database contracts
without an explicit task.

## Testing

Install with Node.js 24.x and pnpm 11.25.0. Run focused checks first, then the
relevant public checks:

```bash
pnpm format
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build
pnpm e2e
```

Use `supabase test db --local` for database tests. Keep the one public unit
suite and the default Playwright suite. Repoint existing tests when public
paths or names change; do not add duplicate cases for a renamed surface.

## Safety and privacy

Never commit credentials, populated environment files, keys, customer data,
generated builds, caches, logs, or exports. Keep scratch files under the
repository `tmp/` directory and remove them after use. Do not store raw IP
addresses. Use HTTP-only, per-link cookies for viewer identity and preserve
the existing analytics consent and email-collection rules.

Before opening a change, read the relevant product and technical document,
review the diff for unrelated changes, and record any known limitation instead
of claiming unsupported behavior is complete.
