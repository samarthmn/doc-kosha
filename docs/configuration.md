# Configuration

The application validates runtime configuration with Zod in
`src/lib/env.ts`. Keep this page synchronized with the public `env.example`
and the schema. Never commit populated environment files or credentials.

## Required browser configuration

| Variable                        | Requirement                         |
| ------------------------------- | ----------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Valid Supabase URL                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Non-empty public anon key           |
| `NEXT_PUBLIC_APP_URL`           | Valid canonical application URL     |
| `NEXT_PUBLIC_APP_ENV`           | `local`, `staging`, or `production` |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`  | Non-empty OAuth client ID           |

`GOOGLE_CLIENT_SECRET` is read by the local Supabase Auth configuration and is
server-only. Without it, Google sign-in is unavailable; email sign-in still
works.

`NEXT_PUBLIC_ENABLE_PRODUCT_GUIDES` is an optional boolean and defaults to
`false`. The optional marketing identifiers are
`NEXT_PUBLIC_GA_MEASUREMENT_ID`, `NEXT_PUBLIC_GOOGLE_ADS_ID`,
`NEXT_PUBLIC_LINKEDIN_PARTNER_ID`, `NEXT_PUBLIC_APOLLO_TRACKER_APP_ID`, and
`NEXT_PUBLIC_META_PIXEL_ID`. Product analytics uses the optional
`NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST`; consent and regional
privacy rules still apply. Browser error reporting uses the optional
`NEXT_PUBLIC_SENTRY_DSN`. Every integration remains inert when its variable is
unset.

## Required server configuration

| Variable                    | Requirement                       |
| --------------------------- | --------------------------------- |
| `R2_ENDPOINT`               | Valid S3-compatible endpoint      |
| `R2_ACCESS_KEY_ID`          | Non-empty storage credential      |
| `R2_SECRET_ACCESS_KEY`      | Non-empty storage credential      |
| `SMTP_HOST`                 | Non-empty SMTP host               |
| `SENDER_EMAIL`              | Valid sender address              |
| `NOTIFICATION_SENDER_EMAIL` | Valid notification sender address |
| `FOUNDER_SENDER_EMAIL`      | Valid founder-help sender address |
| `COOKIE_SECRET`             | At least 32 characters            |

`SUPABASE_SERVICE_ROLE_KEY` is optional in the schema but required by real
public-link and server workflows. `R2_REGION` defaults to `auto` and
`R2_BUCKET` defaults to `dockosha`. `SMTP_PORT` defaults to `54325` and
`SMTP_USER`/`SMTP_PASS` must be set together; both are required outside local
development. `COMMENTS_AUTHOR_SECRET` is optional and must be at least 32
characters when set.

The optional lifecycle settings are
`LIFECYCLE_PROCESSOR_SECRET`,
`LIFECYCLE_DELAY_SETUP_INCOMPLETE_1H_MS`,
`LIFECYCLE_DELAY_SETUP_INCOMPLETE_2D_MS`,
`LIFECYCLE_DELAY_FOUNDER_HELP_DAY_1_MS`,
`LIFECYCLE_DELAY_TRIAL_ENDING_OFFSET_MS`,
`LIFECYCLE_INACTIVITY_THRESHOLD_MS`, and
`LIFECYCLE_RECENT_NUDGE_WINDOW_MS`. The timing overrides apply only in local
development.

`SENTRY_DSN` is an optional server-only URL. Sentry is disabled when both it and
`NEXT_PUBLIC_SENTRY_DSN` are unset. `SENTRY_AUTH_TOKEN` is an optional build-only
credential for source-map upload and must never be committed.
Stripe's optional variables are `STRIPE_MODE` (one of `local`, `staging`,
`production`, `test`, or `live`; default `local`), `STRIPE_SECRET_KEY`, and
`STRIPE_WEBHOOK_SECRET`; self-hosters may leave billing unconfigured.

## Custom domains

The optional server-only variables are `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_CUSTOM_HOSTNAME_FALLBACK_ORIGIN`, and
`CLOUDFLARE_WORKER_ORIGIN_SECRET`. The application can boot without these
values. Every custom-domain operation requires all four, and the worker origin
secret must be at least 32 characters; otherwise the operation returns a typed
503 configuration error and does not use an implicit DNS target.

## Document processing

DocYantra is a mandatory direct `0.0.26` dependency. Its package and capability
contract are validated at startup and per operation; invalid or out-of-envelope
work fails closed. There is no provider-selection or engine-version environment
variable and no fallback converter.

## Testing variables

`CI` is consumed by tooling. `PLAYWRIGHT_BASE_URL` defaults to
`http://localhost:3000`, and `MAILPIT_BASE_URL` defaults to
`http://localhost:54324` when omitted.

Server-only values must never be prefixed with `NEXT_PUBLIC_`. Store all
credentials outside the repository.
