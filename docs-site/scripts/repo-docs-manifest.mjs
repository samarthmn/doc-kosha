// Source files in this manifest stay plain CommonMark. Edit the canonical
// documents in the repository-root docs/ directory.
export const repoDocsManifest = {
  requireAll: true,
  // Existing site pages need link mapping, but must not be copied or replaced.
  links: [
    {
      source: "docs-site/content/docs/how-it-works/conversion-envelope.mdx",
      slug: "how-it-works/conversion-envelope",
    },
  ],
  entries: [
    {
      source: "docs/self-hosting.md",
      output: "content/docs/self-hosting/(synced-content)/self-hosting.md",
      slug: "self-hosting/self-hosting",
      title: "Self-hosting",
      description:
        "Authorized-maintainer reference for a possible future DocKosha deployment; external self-hosting is not currently available.",
    },
    {
      source: "docs/configuration.md",
      output: "content/docs/self-hosting/(synced-content)/configuration.md",
      slug: "self-hosting/configuration",
      title: "Configuration",
      description:
        "Authorized-maintainer configuration reference; external self-hosting is not currently available.",
    },
    {
      source: "docs/architecture.md",
      output: "content/docs/self-hosting/(synced-content)/architecture.md",
      slug: "self-hosting/architecture",
      title: "Architecture",
      description: "Understand the architecture of a DocKosha deployment.",
    },
    {
      source: "docs/providers.md",
      output: "content/docs/self-hosting/(synced-content)/providers.md",
      slug: "self-hosting/providers",
      title: "Providers",
      description:
        "Understand the mandatory private document-processing dependency and its supported operations.",
    },
    {
      source: "docs/capability-matrix.md",
      output: "content/docs/reference/(synced-content)/capability-matrix.md",
      slug: "reference/capability-matrix",
      title: "Capability matrix",
      description: "Review the one-edition application and provider envelope.",
    },
  ],
};
