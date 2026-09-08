# Third-party notices

Dependencies shipped with or used by DocKosha retain their own licenses and
notices. The root AGPL-3.0-or-later license applies to first-party DocKosha code;
it does not relicense third-party software.

The dependency review currently records these decisions for maintainers:

- libvips and related platform packages are reviewed as LGPL-licensed
  dependencies. Their notices and the obligations applicable to the selected
  distribution must remain available.
- The Sentry CLI is reviewed as an FSL-licensed build tool. It is not part of
  the application runtime and is not relicensed by DocKosha.

These notes document repository policy and review history. They are not legal
advice, a blanket approval of every dependency combination, or a substitute
for checking the license and notices of the exact artifacts you distribute.

Included sample documents and other assets have a separate
[fixture publication review](./FIXTURE_PROVENANCE.md). Do not infer their
ownership or redistribution permission from the license on the application
code or from a passing source audit.
