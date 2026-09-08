# Publishing a fresh public repository

This is a manual owner-run guide. It describes a release procedure; it does
not publish anything when read or copied.

## Mandatory safety boundary

Do not make this checkout public. Do not zip it. Do not ship it. Do not use it
as the source directory for publication. The checkout contains local material
that is intentionally outside the public manifest.

Treat this working checkout as exporter input only; its private Git history
must never be copied or made public. Use the dependency-free exporter to a
separate, empty directory outside this checkout (and outside any private
sibling project):

```text
node scripts/export-public-release.mjs --destination /absolute/path/to/a-new-empty-directory
```

The exporter refuses an unsafe destination, source symlinks, excluded paths,
unexpected paths, and failed post-copy manifest or content checks. It preserves
executable modes and prints only safe counts and a manifest hash. Never delete
an existing directory to make the export fit; choose a new empty destination.

## Owner review and legal gate

Publication must stop until counsel or the owner approves the actual intended
license and publication scope. The current AGPL-3.0-or-later terms permit
AGPL-covered use and specify the applicable source and network-copyleft
obligations; they do not impose an educational-only, no-compete, or no-SaaS
restriction. Review and approve all customer-facing legal pages as part of this
gate. The current DPA is visibly a draft and a non-executed agreement; do not
present it as executed. This guide does not recommend or synthesize a
replacement license.

After export, run all clean-candidate checks from the exported directory:

1. Run the public manifest and secret scanner checks in candidate mode before
   initializing Git: `node scripts/check-public-manifest.mjs --mode=check
--source=candidate` and `node scripts/run-gitleaks.mjs --source=candidate`.
   After the owner has created the first commit in the reviewed public
   repository (not merely run `git init`), use `--source=committed` in CI; the
   default `--source=export` is for filtered working-checkout/exporter input,
   while `--source=candidate` is for the actual exported candidate. These are
   the public filesystem-boundary checks.
2. The authorized maintainer must separately run dependency-license, format,
   lint, typecheck, unit, and build checks in the clean candidate. Do not run a
   secret scan against a directory that still contains local secret files.
3. Review the README quickstart, approved license and trademark notices,
   provider capability limits, documentation links, and generated output.
4. Record the public boundary checks, authorized maintainer checks, human
   review, and legal approval separately from
   the exported repository.

The manifest and Gitleaks checks are filesystem checks only. They cannot certify
old Git history. After approval, the owner must manually create fresh history
in the clean directory, add only the reviewed public files, and publish using
the owner's chosen hosting settings. This guide does not create a remote,
orphan repository, commit, or publication.
