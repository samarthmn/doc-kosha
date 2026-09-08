# DocKosha documentation site

This directory contains the self-contained public documentation application.
It is a separate Next.js application with its own dependencies and lockfile,
not a pnpm workspace member.

## Run locally

```bash
cd docs-site
pnpm install
pnpm dev
```

The `predev` and `prebuild` hooks synchronize the canonical CommonMark files
from the repository-root `docs/` directory before the site loads content. A
production check is:

```bash
cd docs-site
pnpm build
pnpm start
```

## Canonical content

`scripts/repo-docs-manifest.mjs` maps the public operator documents in
`../docs/` into generated `(synced-content)` groups under
`content/docs/self-hosting/` and `content/docs/reference/`.
`scripts/sync-repo-docs.mjs` injects frontmatter and rewrites links between
manifest-managed documents. Generated pages are build artifacts; edit the
repository-root Markdown files instead.

The manifest requires every source document. A missing source is an error, not
a labelled public-repository stub. Root documents remain plain CommonMark so
they render in repository viewers and on this site.

## Deployment

Create a hosting project with Root Directory set to `docs-site` and enable
source files outside the root directory so the prebuild sync can read
`../docs`. Point the documentation hostname at that project after a human
review of the generated pages. The site does not require changes to the main
product's host-routing middleware.
