---
title: "DocKosha is now open source: secure document sharing and data rooms"
seoTitle: "DocKosha Is Open Source — Document Sharing & Data Rooms"
description: "Explore DocKosha’s open-source document sharing and virtual data rooms under AGPL-3.0-or-later, current Cloud plans, and what comes next for self-hosting."
socialTitle: "DocKosha is now open source"
socialDescription: "Document sharing. Built in the open. Explore the application source, use DocKosha Cloud, and see what’s next for DocYantra."
slug: "dockosha-open-source"
author: "Samarth M N"
authorType: "Person"
authorBio: "Samarth M N is the founder of DocKosha, a platform for secure document sharing and virtual data rooms."
date: "2026-09-10"
tags:
  - "Open source"
  - "Product"
  - "Virtual data rooms"
keywords:
  - "DocKosha open source"
  - "open-source document sharing"
  - "secure document sharing"
  - "virtual data rooms"
  - "DocKosha self-hosting"
heroImage: "/assets/blog/dockosha-open-source-launch.png"
heroImageWidth: 1254
heroImageHeight: 1254
heroImageAlt: "DocKosha is now open source. White and lilac document pages float upward from a stack against a dark background. Supporting text reads “Document sharing. Built in the open.” The website dockosha.com appears at the bottom right."
featured: true
---

Almost a year ago, I got tired of checking which subscription unlocked the document controls I needed. That frustration became DocKosha, a platform for secure document sharing and virtual data rooms.

Today, we're publishing the application source under **AGPL-3.0-or-later**. You can read the code, review how document access works, and contribute to the product. [DocKosha Cloud](/pricing) remains the managed service you can use today.

This opens the application code for inspection and contribution. DocYantra, our document-processing engine, is planned for a future open-source release; independent self-hosting isn't available today.

I'm proud to share this, and I want to explain the choices behind it.

## Why I built DocKosha

I spent time looking at document-sharing tools such as [Dropbox DocSend](https://www.docsend.com/pricing/) and [Papermark](https://www.papermark.com/pricing). I wanted secure links, useful document analytics, and a data room with sensible access controls. I kept returning to pricing tables to work out which subscription covered the workflow.

What kept me building was the small team on the other side of the pricing page. A founder preparing investor documents. An adviser sharing confidential information. Someone who needs control over a file, even if they don't need much storage.

Their documents matter just as much.

## One open-source application, with managed Cloud plans

DocKosha has one public application source edition. That includes the code for [secure document sharing](/secure-document-sharing), [virtual data rooms](/features/data-room), document analytics, granular access permissions, [NDA gates](/features/nda), and [watermarking](/features/watermarking).

Source availability and hosted subscriptions answer different questions. The public repository lets you inspect and contribute to the application. Cloud plans determine the capacity and features available in the managed service.

Today, Free includes 250 MB of storage, 2 GB of monthly public bandwidth, PDF-only uploads, and one workspace member. Custom domains, branding removal, and retained previous versions require a paid plan. The [pricing page](/pricing) lists the current allowances and differences.

Running the service costs money. Storage, document processing, maintenance, and support need funding. I want DocKosha to be sustainable because people find it useful and reasonably priced. I want customers to feel good about paying us.

If you're looking for a DocSend alternative for document sharing or a virtual data room for fundraising, start with the workflow you need, review the plan details, and inspect the code behind the product.

## Why open the source?

When someone uploads a pitch deck, a contract, or confidential diligence material, they're placing real trust in the software handling it.

Publishing the application code gives developers and security reviewers something concrete to examine: how access checks work, how sharing rules are applied, and how the application handles analytics. Our [security page](/security) explains the current security and privacy boundaries.

Code visibility doesn't prove how a hosted service operates or replace security reviews. It does make more of our work open to scrutiny. That matters in a product built around sensitive documents.

I also want people to challenge our assumptions. Contributors may notice a confusing permission setting, a missing accessibility detail, or a document workflow we haven't considered. There's a limit to what one founder can see from inside their own application.

DocKosha's public application source is licensed under [AGPL-3.0-or-later](https://github.com/samarthmn/doc-kosha/blob/HEAD/LICENSE). The repository includes the license and contribution guidance so you can review the terms alongside the code. Enterprise licensing requires a separate signed agreement.

## Can you self-host DocKosha today?

**Not yet.** The application depends on DocYantra, our private document-processing engine for supported PDF and Office workflows.

We plan to open-source DocYantra next, as a step toward making the complete platform independently runnable. The release is still on the roadmap. Until the dependency is available and the installation path is ready, the public repository supports inspection and contribution but isn't a runnable self-hosting distribution. Our [Cloud and self-hosting guide](/hosted-vs-self-hosted) explains what is available now and what future operators would need to maintain.

When self-hosting becomes available, operating the platform will still mean maintaining its database, storage, email delivery, document processing, backups, security updates, and monitoring. Some teams want that responsibility and control.

DocKosha Cloud is the managed service available now. We handle the operational work so you can prepare your data room, share your documents, and get back to the work around them. My ambition is to make that experience good enough that people choose it because it saves them time.

## Help shape what comes next

After almost a year, opening the application feels personal. I hope the open-source community welcomes us, questions us, and helps make DocKosha better.

If you use document-sharing tools, tell us where they get in your way. If you build software, our [contribution guide](https://github.com/samarthmn/doc-kosha/blob/HEAD/CONTRIBUTING.md) explains how to get involved.

I started DocKosha with my own frustrations. I want the next chapter to include yours.

[Try DocKosha Cloud](/auth/sign-in?redirect=%2Fonboarding) · [Explore the source](https://github.com/samarthmn/doc-kosha)
