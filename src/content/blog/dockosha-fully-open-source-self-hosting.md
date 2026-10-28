---
title: "DocKosha is now fully open source, and you can self-host it"
seoTitle: "DocKosha Is Fully Open Source and Self-Hostable"
description: "DocKosha and its DocYantra document engine are both open source under AGPL-3.0-or-later. Here is what that means, what you need to self-host, and when Cloud makes more sense."
socialTitle: "DocKosha is fully open source and self-hostable"
socialDescription: "The application and the document engine are both public under AGPL-3.0-or-later. Run DocKosha on your own infrastructure, or use DocKosha Cloud."
slug: "dockosha-fully-open-source-self-hosting"
author: "Samarth M N"
authorType: "Person"
authorBio: "Samarth M N is the founder of DocKosha, a platform for secure document sharing and virtual data rooms."
date: "2026-10-28"
tags:
  - "Open source"
  - "Self-hosting"
  - "Product"
keywords:
  - "DocKosha open source"
  - "self-hosted document sharing"
  - "self-hosted data room"
  - "open-source virtual data room"
  - "DocYantra"
  - "DocKosha self-hosting"
heroImage: "/assets/blog/dockosha-open-source-launch.png"
heroImageWidth: 1254
heroImageHeight: 1254
heroImageAlt: "DocKosha is now open source. White and lilac document pages float upward from a stack against a dark background. Supporting text reads “Document sharing. Built in the open.” The website dockosha.com appears at the bottom right."
---

In September I wrote that [DocKosha is open source](/blog/dockosha-open-source). That was true for the application, but there was one part still missing, which was DocYantra, the engine that actually opens, converts, and watermarks the PDF and Office files. So if you wanted to really understand how DocKosha handles a document from upload to the viewer, you could read most of the code but not the part doing the heavy work on the file itself.

That part is now public as well. Both [DocKosha](https://github.com/samarthmn/doc-kosha) and [DocYantra](https://github.com/samarthmn/doc-yantra) are open source under **AGPL-3.0-or-later**, and you can run DocKosha on your own infrastructure. So I think it is fair to say DocKosha is now fully open source and self-hostable.

## What does "fully open source" mean here?

There are two repositories and both are public:

- **DocKosha** is the Next.js application. This is where sharing links, [virtual data rooms](/features/data-room), access permissions, [NDA gates](/features/nda), analytics, and [watermarking](/features/watermarking) live.
- **DocYantra** is the document-processing engine. It does the validated PDF and Office operations, for example converting a file for the viewer or stamping a watermark before a download.

There is one public edition of the application. There is no hidden "enterprise version" of the code with extra features that you cannot see. When I started DocKosha, one of the things which frustrated me was tools like DocSend gating certain features behind a particular plan, when it is just a feature, just a piece of code. So publishing the code is kind of the same thinking taken one step further. You can see exactly what the product does, not just read what the pricing page says it does.

## Why does this matter for a document-sharing product?

When someone uploads a pitch deck or a contract or diligence material, they are trusting the software with something confidential. For example, if a founder sets a link to expire after a week, they want to be sure the link really stops working after a week. With the code public, a developer or a security reviewer can actually go and check how access is checked, how the expiry is applied, and how the watermark is added, instead of taking my word for it.

Of course reading the code does not prove how a hosted service is operated, and it does not replace a proper security review. But I think it makes more of the work open to questions, and for a product built around sensitive documents that is a good thing. Our [security page](/security) explains the current security and privacy boundaries in more detail.

## How self-hosting works

Self-hosting means you run the same application on your own infrastructure. The pieces you operate are:

- A **Node.js 24** application host (the Next.js app).
- **Supabase** for Postgres and authentication.
- An **S3-compatible** bucket for the documents.
- **SMTP** for sign-in codes and notification emails.

One thing I want to point out is that DocYantra does not need a separate conversion server. It runs inside the application through versioned Rust and WebAssembly packages, so there is no extra service to deploy and you do not need a Rust toolchain to run DocKosha. The packages are distributed through GitHub Packages, and GitHub asks for authentication even for public packages, so you will need a classic GitHub token with `read:packages` access to install them.

The [self-hosting guide](/self-hosting) walks through the setup, and the [full repository walkthrough](https://github.com/samarthmn/doc-kosha/blob/HEAD/docs/self-hosting.md) goes step by step, from local Supabase and MinIO all the way to a production deployment with HTTPS, storage CORS, and email. If you want to embed or build the engine on its own, the [DocYantra deployment guide](https://github.com/samarthmn/doc-yantra/blob/HEAD/SELF-HOSTING.md) covers that.

## The honest part: self-hosting is at your own risk

I want to be very clear here. Self-hosting is **not officially supported**. If you run DocKosha yourself, you own the database, the storage, email delivery, backups, security updates, and monitoring. Community help is best effort and there is no SLA. It is not a one-command installer either, it is an operator guide, so you should be comfortable running these services before you put real documents on it.

So should you self-host or use Cloud? I would say it depends. If your team has to keep documents on its own infrastructure, or you already run Postgres and object storage and you are happy to maintain one more application, self-hosting can make sense. If you just want to set up a data room and share files with investors or buyers this week, then [DocKosha Cloud](/pricing) is probably the better choice, because we handle all the operational work and you can focus on the actual deal. There is a [Cloud and self-hosting comparison](/hosted-vs-self-hosted) if you want to see the trade-offs side by side.

Cloud plans still work the same way. The Free plan is still there, and the [pricing page](/pricing) lists the current allowances for each plan. Running the managed service costs money, storage and processing and support all need funding, so Cloud is also how DocKosha stays sustainable. Enterprise licensing still needs a separate signed agreement, and the [commercial licensing terms](https://github.com/samarthmn/doc-kosha/blob/HEAD/COMMERCIAL-LICENSING.md) are in the repository.

## What next

If you try self-hosting and something in the guide is confusing or a step is missing, please open an issue, that kind of feedback is the most useful thing for me right now. If you build software, the [contribution guide](https://github.com/samarthmn/doc-kosha/blob/HEAD/CONTRIBUTING.md) explains how to get involved. And if you just want to share documents securely without running any of this, Cloud is there for that.

[Try DocKosha Cloud](/auth/sign-in?redirect=%2Fonboarding) · [DocKosha source](https://github.com/samarthmn/doc-kosha) · [DocYantra source](https://github.com/samarthmn/doc-yantra) · [Self-hosting guide](/self-hosting)
