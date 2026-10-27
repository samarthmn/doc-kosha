# Self-hosting DocKosha

DocKosha and its document-processing engine, [DocYantra](https://github.com/samarthmn/doc-yantra),
are open source under AGPL-3.0-or-later. You can run the application on your own
infrastructure. Self-hosting is not officially supported: you own operations,
security updates, backups, and recovery. [DocKosha Cloud](https://www.dockosha.com)
is the managed service if you would rather focus on sharing documents.

This guide uses the existing Next.js application and mandatory DocYantra
`0.0.28` packages. DocYantra runs in-process; there is no separate conversion
server, provider selector, or fallback converter. See the
[conversion envelope](../docs-site/content/docs/how-it-works/conversion-envelope.mdx)
for supported operations. Enterprise licensing requires a separate signed
agreement; see [Commercial licensing](https://github.com/samarthmn/doc-kosha/blob/HEAD/COMMERCIAL-LICENSING.md).

## Architecture and prerequisites

You operate a Node.js application, Supabase (Postgres and Auth), an S3-compatible
object bucket, and SMTP. Local development uses Docker for Supabase and MinIO.
The repository's Compose file runs local object storage only, not the whole app.

Install Git, Node.js **24.x**, pnpm **11.25.0**, Docker with Compose, and the
Supabase CLI. Keep Docker running. Local ports include application `3000`,
Supabase API `54321`, Postgres `54322`, Studio `54323`, Mailpit `54324`, SMTP
`54325`, and MinIO `9000`/`9001`; use an isolated machine or free ports.

## 1. Get the source and install dependencies

```bash
git clone https://github.com/samarthmn/doc-kosha.git
cd doc-kosha
```

The four DocYantra packages are distributed through GitHub Packages:
`@samarthmn/dockosha-provider-docyantra`, `@samarthmn/doc-yantra`,
`@samarthmn/doc-yantra-office`, and `@samarthmn/doc-yantra-fonts`.
GitHub requires authentication even for public npm packages. Create an expiring
personal access token (classic) with `read:packages` access; fine-grained tokens
are not supported for this registry. Keep it in your user-level npm configuration
or a CI secret, never a repository file. You can open that configuration with:

```bash
npm config edit --location=user
```

Add `//npm.pkg.github.com/:_authToken=<your-token>` there. The scoped registry
is already configured in `pnpm-workspace.yaml`. Do not paste a real token into
a terminal command that will be saved in shell history.

```bash
pnpm install --frozen-lockfile
cp env.example .env.local
```

Use the exact locked versions. Mixed adapter, engine, and font versions fail
runtime checks. Neither a Rust toolchain nor native pdfium is needed to run
DocKosha. See [DocYantra's deployment guide](https://github.com/samarthmn/doc-yantra/blob/HEAD/SELF-HOSTING.md)
for engine embedding and source development.

## 2. Start local services

The local Supabase configuration enables Google sign-in. Before starting it,
either export your own `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
in the CLI environment, or set `enabled = false` under
`[auth.external.google]` in your local `supabase/config.toml`. Keep this local
choice out of unrelated upstream contributions. Email sign-in does not require
Google OAuth. The application schema still requires a non-empty
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`; use `disabled` locally when testing email only.

```bash
pnpm supabase:up
pnpm r2:up
supabase status
```

On a new local project, Supabase applies the repository migrations when it
initializes the database. To apply newly pulled migrations to an existing local
instance, use `supabase migration up --local` after reviewing them. Do not use
`supabase db reset` on data you need to retain.

The first MinIO start builds pinned server/client releases from upstream Go
source. It needs network access and takes longer than subsequent starts. The
initializer creates the `dockosha` bucket and enables anonymous object reads for
the local simulator. These development credentials and bucket permissions are
not a production security configuration.

## 3. Configure the application

Edit `.env.local` using [Configuration](configuration.md) and `env.example` as
the reference. Never publish the populated file or paste `supabase status`
credentials into an issue.

- Set `NEXT_PUBLIC_APP_URL=http://localhost:3000` and
  `NEXT_PUBLIC_APP_ENV=local`.
- Copy the local API URL, anon key, and service-role key from `supabase status`
  into `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and
  `SUPABASE_SERVICE_ROLE_KEY`. The service-role key is server-only and is
  required for working public links.
- Use `R2_ENDPOINT=http://localhost:9000`, `R2_REGION=us-east-1`,
  `R2_BUCKET=dockosha`, and the local Compose credentials (`minioadmin`) for
  both storage keys. Never reuse these credentials outside local development.
- Set `SMTP_HOST=127.0.0.1`, `SMTP_PORT=54325`, and leave `SMTP_USER` and
  `SMTP_PASS` empty locally. Use your own valid sender addresses for
  `SENDER_EMAIL`, `NOTIFICATION_SENDER_EMAIL`, and `FOUNDER_SENDER_EMAIL`.
  Local mail appears in Mailpit at `http://localhost:54324`.
- Generate an independent random secret of at least 32 characters for
  `COOKIE_SECRET`; set another for `COMMENTS_AUTHOR_SECRET` if used.
  `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`
  produces a suitable value. Store it privately.
- Leave Stripe, analytics identifiers, Sentry, and Cloudflare credentials unset
  unless you intend to configure those integrations. Billing configuration does
  not remove the application's existing plan and entitlement rules.

Next.js reads `.env.local`; the Supabase CLI's process environment is separate.
If Google sign-in is enabled, configure both with the same client ID and the
server-only OAuth secret. Allow `http://localhost:3000/auth/callback` in
Supabase Auth, and the Supabase callback URL in Google's OAuth configuration.
The checked-in local allowlist also includes `127.0.0.1`; choose one app origin
consistently for browser sessions.

## 4. Start and verify

```bash
pnpm dev
```

Open `http://localhost:3000`. Sign in by email, retrieve the message from Mailpit,
and finish onboarding. Upload a small synthetic PDF, create a sharing link,
and open it in a private browser window. Verify the viewer loads and that
revoking or expiring the link prevents access. Test an email gate and a
watermarked download using the features available to the workspace.

Use synthetic files, never confidential material, for the first verification.
For document conversion, confirm both a supported sample and an unsupported
sample behave as described in the conversion envelope. Failed preview conversion
leaves the original available; required watermarking failures must block delivery.

Stop only services you started with `pnpm supabase:down` and `pnpm r2:down`.
Do not delete Docker volumes unless you intend to delete local data.

## Production deployment

Use Node.js 24.x on a persistent application host or a compatible hosting
platform, a provisioned Supabase project, S3-compatible storage, authenticated
SMTP, and HTTPS. This is an operator guide, not a one-command production installer.

1. Choose a public origin and set `NEXT_PUBLIC_APP_URL` to it and
   `NEXT_PUBLIC_APP_ENV=production`. Supply secrets through the host's secret
   manager, including a server-only Supabase service-role key and independent
   cookie secrets. Browser variables are embedded at build time; rebuild when
   they change. Replace every example sender address and storage credential.
2. Review and apply the repository migrations to your own database using the
   Supabase CLI's linked-project workflow. Back up existing data first, verify
   the target project, and review `supabase db push --dry-run` before
   `supabase db push`. Do not disable RLS or copy development seed data into
   production. Building the app does not apply migrations.
3. Set your app origin as the Supabase Auth site URL and allow its
   `/auth/callback` URL. Configure the Google provider only if used. Configure
   Supabase Auth's own SMTP as well as application SMTP; they deliver different
   classes of messages. Production application SMTP requires both user and
   password, with verified sender domains. Set Supabase Auth email OTP length
   to **six digits** and configure signup/sign-in templates to include
   `{{ .Token }}`: the app asks users to enter a six-digit email code. Use the
   templates in `supabase/templates/` as a reference. Database migrations do
   not deploy local Auth settings or templates to a hosted Supabase project.
4. Provision your bucket and least-privilege storage keys. Configure CORS for
   your actual app/viewer origins with `GET`, `HEAD`, and `PUT`. Allow the
   `Content-Type` request header (`AllowedHeaders: ["Content-Type"]`, or `["*"]`
   if your storage provider requires broader signed-request headers); expose `ETag`,
   `Content-Length`, `Content-Range`, `Accept-Ranges`, `Content-Disposition`,
   and `Content-Type`. Validate presigned upload, authenticated delivery, range
   reads, and downloads. Do not copy MinIO's anonymous-download policy.
5. Install locked dependencies using a read-only GitHub Packages credential
   available during installation. Build and verify the deployed engine assets:

   ```bash
   pnpm build
   node scripts/verify-engine-build-artifact.mjs
   pnpm start
   ```

   Keep required dependencies and application assets available in the runtime.
   Put HTTPS termination and a process supervisor in front of a persistent Node
   deployment; preserve request headers and allow the document sizes you intend
   to support. Do not expose a development server as production.

6. Configure optional integrations only when needed. Custom-domain operations
   require the complete Cloudflare configuration and worker described in
   [Configuration](configuration.md); otherwise they return a configuration
   error. Stripe needs your own account, prices, webhook setup, and existing
   application plan mappings. Leave analytics and error-reporting identifiers
   unset if you do not want those services.
7. Repeat the first-document checks over HTTPS, including email delivery,
   gated access, revocation, storage CORS, and watermarking. Verify scheduled
   work for your host: the repository does not provision a production cron;
   a persistent local processor starts only in the local application environment.
   Schedule authenticated calls to `/api/internal/lifecycle/process` with
   `Authorization: Bearer <LIFECYCLE_PROCESSOR_SECRET>` using your own scheduler
   before relying on lifecycle email. Set a dedicated server-only processor
   secret; do not expose it in browser configuration.

## Upgrades, backups, and troubleshooting

Back up Postgres and object storage together, retain application configuration
securely, and test restoration. Review changes and migration compatibility before
upgrading. Deploy matching application and DocYantra versions, then verify the
engine bundle and sharing flow again. A rollback may require restoring compatible
data; rolling back code does not undo database migrations.

- **Package installation returns 401/403:** check the scoped registry, classic
  token expiry, `read:packages`, and package access without exposing the token.
- **Startup rejects configuration:** compare `.env.local` with the current Zod
  schema and configuration reference; required public fields cannot be blank.
- **Email is missing:** distinguish Supabase Auth mail from app mail; check
  Mailpit locally and both SMTP configurations in production.
- **Upload or viewer fails:** check bucket existence, endpoint, credentials,
  CORS, and service-role configuration. Do not make production objects public
  as a workaround.
- **Conversion is unsupported:** consult the documented envelope. There is no
  fallback engine; package/contract failures fail closed.

Report reproducible, sanitized issues through the repositories. Community help
is best effort and does not include an SLA or deployment assistance. See
[Support](https://github.com/samarthmn/doc-kosha/blob/HEAD/SUPPORT.md).
