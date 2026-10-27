import Link from "next/link";

const steps = [
  [
    "Install the application",
    "Clone DocKosha, configure GitHub Packages authentication, and install with pnpm install --frozen-lockfile. Copy env.example to your private local environment file.",
  ],
  [
    "Prepare the services",
    "Start local Supabase and MinIO with Docker, or provision your own production Supabase project and S3-compatible bucket. Apply the repository migrations to your own database.",
  ],
  [
    "Configure access and email",
    "Set your app origin, Supabase keys, storage credentials, SMTP, sender addresses, and independent cookie secrets. Configure Auth redirect URLs and optional Google sign-in.",
  ],
  [
    "Run and verify",
    "Start locally with pnpm dev. For production, build, verify the engine bundle, and run behind HTTPS. Sign in, upload a synthetic PDF, share a gated link, and test revocation and watermarking.",
  ],
] as const;

const linkClass =
  "rounded-sm text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export function SelfHostingContent() {
  return (
    <div className="space-y-12 pb-16">
      <section aria-labelledby="self-hosting-prerequisites">
        <h2
          id="self-hosting-prerequisites"
          className="text-2xl font-medium tracking-tight"
        >
          What you need
        </h2>
        <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
          Node.js 24.x, pnpm 11.25.0, Supabase for Postgres and authentication,
          S3-compatible object storage, and SMTP. Local development also needs
          Docker with Compose and the Supabase CLI. The repository Compose file
          starts local object storage; it is not a production app installer.
        </p>
        <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
          DocYantra 0.0.28 runs inside the application as Rust and WebAssembly
          packages. There is no separate document-processing server or fallback
          converter. GitHub Packages requires an expiring classic GitHub token
          with read:packages access, even for public packages. Store that token
          in user-level npm configuration or a CI secret.
        </p>
      </section>
      <section aria-labelledby="self-hosting-setup">
        <h2
          id="self-hosting-setup"
          className="text-2xl font-medium tracking-tight"
        >
          From source to your first shared document
        </h2>
        <ol className="mt-6 grid gap-5 md:grid-cols-2">
          {steps.map(([heading, body], index) => (
            <li key={heading} className="rounded-lg border bg-card p-6">
              <h3 className="text-lg font-medium">
                {index + 1}. {heading}
              </h3>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {body}
              </p>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          Exact commands and configuration are in the{" "}
          <a
            className={linkClass}
            href="https://github.com/samarthmn/doc-kosha/blob/HEAD/docs/self-hosting.md"
          >
            repository setup walkthrough
          </a>
          , also published in the{" "}
          <a
            className={linkClass}
            href="https://docs.dockosha.com/docs/self-hosting/self-hosting"
          >
            public documentation
          </a>
          .
        </p>
      </section>
      <section aria-labelledby="self-hosting-responsibilities">
        <h2
          id="self-hosting-responsibilities"
          className="text-2xl font-medium tracking-tight"
        >
          Your deployment, your operations
        </h2>
        <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
          Self-hosting is not officially supported. You manage migrations,
          storage permissions and CORS, email delivery, secrets, HTTPS,
          monitoring, security updates, backups, and tested restores. Community
          help is best effort and has no SLA. Existing application plan rules
          still apply; an open-source license is separate from Cloud pricing.
        </p>
        <p className="mt-4 max-w-3xl leading-7 text-muted-foreground">
          Supported conversion depends on DocYantra’s documented envelope.
          Failed preview conversion leaves the original file available; required
          watermarking failures block delivery. Custom domains need additional
          Cloudflare infrastructure. Optional billing and analytics services
          need your own configuration.
        </p>
        <p className="mt-4 leading-7">
          <Link className={linkClass} href="/hosted-vs-self-hosted">
            Compare Cloud and self-hosting
          </Link>
        </p>
      </section>
      <section aria-labelledby="self-hosting-source">
        <h2
          id="self-hosting-source"
          className="text-2xl font-medium tracking-tight"
        >
          Inspect both repositories
        </h2>
        <ul className="mt-4 space-y-3 leading-7">
          <li>
            <a
              className={linkClass}
              href="https://github.com/samarthmn/doc-kosha"
            >
              DocKosha on GitHub
            </a>{" "}
            — application, sharing controls, and operator docs.
          </li>
          <li>
            <a
              className={linkClass}
              href="https://github.com/samarthmn/doc-yantra"
            >
              DocYantra on GitHub
            </a>{" "}
            — PDF and Office engines and package source.
          </li>
          <li>
            <a
              className={linkClass}
              href="https://github.com/samarthmn/doc-yantra/blob/HEAD/SELF-HOSTING.md"
            >
              DocYantra deployment guide
            </a>{" "}
            — embedding, offline fonts, and source builds.
          </li>
        </ul>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
          Both projects use AGPL-3.0-or-later; review each repository’s license
          and third-party notices. Enterprise licensing requires a separate
          signed agreement.{" "}
          <Link className={linkClass} href="/blog/dockosha-open-source">
            Read why we opened the source.
          </Link>
        </p>
      </section>
    </div>
  );
}
