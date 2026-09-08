# Sign-in alerts

DocKosha suppresses the first authenticated session for each account and sends a
security alert for every later real sign-in, including familiar devices. Repeated
browser callbacks, page loads, and access-token refreshes do not create new
alerts. The existing `security_login_alerts_enabled` preference still controls
these messages. Welcome mail remains once per account ID. Deleting an account and
creating another at the same email address creates a new welcome identity.

## Capture and delivery

`auth.sessions` insertion atomically creates a `login_session_events` record.
`user_login_baselines` decides which session is first, using a unique user key
that serializes concurrent initial sign-ins. The browser does not decide whether
a session is eligible, so delayed or reversed callbacks cannot swap first and
subsequent sessions. The migration seeds accounts with a prior `last_sign_in_at`
or an existing session, including accounts currently signed out. Pending accounts
that have never authenticated retain silent first-session behavior.

Eligible events enqueue the existing lifecycle queue with `email_key =
'login-session'`, a NULL workspace, and dedupe key
`login-session:<user-id>:<session-id>`. The queue initially waits 30 seconds for
optional browser context. The authenticated endpoint verifies JWT claims,
rechecks the user, and verifies live session ownership through a service-only
RPC before enriching the existing record and trying the common lifecycle sender.
It does not accept a browser timestamp or create an event. The only saved context
is a coarse device label and a trusted country code; no IP address, access token,
refresh token, cookie, or raw user agent is persisted in this ledger.

The worker dispatches account sign-ins before its workspace-required branch and
uses the same sender and delivery claim as the endpoint. Browser closure and
logout do not remove captured events. Account deletion removes them; missing
accounts are skipped. Unknown device and country are displayed honestly when no
callback arrives. A disabled preference marks the event terminally suppressed.
A busy delivery lease returns `deferred`; the worker reschedules it for one minute
later without archiving it or resetting attempts. Failed sends remain retryable.
The existing email lease is ten minutes; workers can reclaim a stale lease.

## Controlled rollout

1. Apply `20260908120150_auth_session_login_alerts.sql`. Capture starts with
   delivery eligibility disabled, and existing sessions are recorded as silent.
   Session inserts are locked during installation so baseline seeding has no gap.
2. Deploy the application and its lifecycle consumer together. Verify local or
   staging sign-in, initial-session suppression, same-device subsequent sign-in,
   notification preferences, and worker delivery with no browser callback. The
   existing lifecycle processor endpoint/worker schedule must be healthy.
3. As a database operator, after those checks, execute the following once in the
   intended environment. This is deliberately unavailable to browser roles and
   the application's service role:

   ```sql
   select public.activate_login_session_alerts();
   ```

   Activation holds an exclusive rollout-row lock; session capture holds a shared
   lock for its transaction. Activation waits for earlier capture transactions,
   suppresses all pre-activation records, and then enables future capture. An
   overlapping transaction can serialize before activation and remain silent.
   Every insertion after activation completes uses the enabled state. Calling
   activation again while enabled is a no-op and does not suppress eligible jobs.

4. Check new sign-in jobs and delivery outcomes using IDs and status counts only.
   Never export authentication tokens or customer context into logs or reports.

No activation is included in the migration or application startup. Deployment of
this change alone must not send historical sign-in emails. Old application
instances must be drained before activation because they do not recognize the
new lifecycle email key.

## Validation and operational limits

Run `supabase test db --local` for ledger, queue deferral, access-control, welcome
identity, and existing delivery-lease regressions. Unit tests exercise browser
single-flight behavior, worker dispatch without a workspace, endpoint/worker
claim contention, fallback content, and notification suppression. A local
migration replay with synthetic pre-existing signed-out, active, and pending
accounts validated seeding. Two concurrent database connections validated first
session serialization and activation waiting for an open capture transaction.

Capture and enqueue are intentionally atomic. A trigger, ledger, or queue failure
can fail the sign-in transaction; do not deploy without checking the exact local
and staging Auth/Postgres versions. The ledger is independent of session cleanup,
so account deletion is its current retention boundary.

As with the existing SMTP delivery pipeline, a process crash after SMTP accepts a
message but before the sent marker is committed can cause a retry delivery. The
durable dedupe claim prevents concurrent normal sends, but SMTP does not provide
an exactly-once transaction with Postgres.
