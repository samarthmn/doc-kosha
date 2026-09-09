# Architecture

DocKosha is one public-source Next.js 16 application using the App Router and TypeScript.
The Next.js server renders the UI, serves API routes, and runs server-side
application logic. There is no required separate backend service.

## Main components

| Component                    | Responsibility                                                                                                                                                                         |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js application          | Routes, UI composition, API adapters, authentication boundaries, and server logic                                                                                                      |
| Supabase Postgres            | Workspaces, documents, links, gates, memberships, billing metadata, and audit records                                                                                                  |
| S3-compatible storage        | Original uploads, converted PDFs, and branding assets                                                                                                                                  |
| SMTP                         | One-time passcodes, invitations, NDA notifications, and lifecycle mail                                                                                                                 |
| Document-processing provider | Private DocYantra dependency used by DocKosha Cloud and authorized maintainer builds for PDF/Office conversion, merge, watermark burn-in, page counting, CSV conversion, and redaction |

The dependency direction is `src/app` → `src/modules` → `src/server`/`src/lib`.
Route files compose components and modules; domain logic belongs in feature
modules; `src/server` contains framework-agnostic adapters; and `src/lib`
contains shared primitives such as environment validation and Supabase helpers.
Server-only code does not import React. IO boundaries use Zod validation.

## Tenant isolation and access

Postgres row-level security is the tenant-isolation boundary. Workspace owners
have full control. Other members receive `none`, `viewer`, or `editor` access
for documents and data rooms, with explicit room grants where needed.
Authenticated routes also enforce access in
`src/app/(authenticated)/layout.tsx`; unauthenticated users are redirected to
sign-in. Public-link routes perform gate checks on the server because viewers
have no Supabase session.

The service-role client is reserved for public flows, secret operations,
multi-step orchestration, and integrations. Every server route validates input,
stays thin, and never exposes service-role credentials to the browser.

## Storage and document delivery

Postgres stores metadata and S3-compatible storage stores bytes. A document may
have an original upload and a converted PDF. The viewer selects a converted
asset only when its conversion status is `completed`; otherwise it serves the
original file. Watermarked downloads use a successfully transformed PDF and
fail closed when watermarking cannot complete.

## Provider boundary

Document processing in DocKosha Cloud uses
`packages/provider-interface/src/index.ts`. The DocYantra adapter is the
application's mandatory private direct engine dependency for Cloud and authorized
maintainer builds; provider-specific
implementation details remain isolated behind that contract.

DocYantra is the private mandatory direct `0.0.26` dependency for document processing.
It provides the validated PDF and Office conversion, merge, watermark, page
count, and redaction operations. Work outside its documented envelope returns a
typed failure and never falls back to a lower-fidelity converter.

## Public-link request path

1. A route loads the public resource and renders the viewer shell.
2. The viewer calls the link-resolution API with the link and resource IDs.
3. The server validates the request, applies rate limits, loads gates, and
   checks passwords, email identity, allow/block rules, NDA state, expiry,
   revocation, and workspace access.
4. A successful resolution receives signed, HTTP-only, per-link cookies.
5. Subsequent byte and download requests re-check the signed state, resource
   access, bandwidth, conversion status, and watermark requirements before
   serving storage bytes.

Browser screenshot controls are deterrence only. No browser can prevent an OS
screen capture or a camera photograph.
