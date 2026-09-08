import "server-only";

import fs from "node:fs";
import path from "node:path";
import React, { cache } from "react";

type PolicyHtmlArticleProps = {
  policyHtmlPath: string;
  ariaLabel: string;
  sanitizeHtml?: (html: string) => string;
};

const readPolicyHtml = cache((policyHtmlPath: string) => {
  const absolutePath = path.isAbsolute(policyHtmlPath)
    ? policyHtmlPath
    : path.join(process.cwd(), policyHtmlPath);

  return fs.readFileSync(absolutePath, "utf8");
});

const shellClasses = [
  // Nocturne: 8px card, restrained theme-aware depth, 58ch running measure.
  "dk-nocturne-surface mx-auto w-full rounded-lg p-6 sm:p-10",
  "max-w-[calc(58ch+3rem)] sm:max-w-[calc(58ch+5rem)]",
  "text-[0.9375rem] leading-7 text-muted-foreground",
];

const contentClasses = [
  "policy-content",
  "space-y-4",
  "[&_*]:max-w-full",
  "[&_*]:!font-sans",
  "[&_*]:!text-inherit",
  "[&_strong]:!text-foreground",
  "[&_em]:!text-muted-foreground",
  "[&_h1]:!mt-0 [&_h1]:!text-3xl [&_h1]:!font-medium [&_h1]:!tracking-[-0.03em] [&_h1]:!leading-tight [&_h1]:!text-foreground",
  "[&_h2]:!mt-10 [&_h2]:!text-[1.375rem] [&_h2]:!font-medium [&_h2]:!tracking-[-0.01em] [&_h2]:!leading-8 [&_h2]:!text-foreground [&_h2]:scroll-mt-24",
  "[&_h3]:!mt-8 [&_h3]:!text-lg [&_h3]:!font-medium [&_h3]:!leading-7 [&_h3]:!text-foreground [&_h3]:scroll-mt-24",
  "[&_p]:!my-4 [&_p]:!leading-7 [&_p]:!text-muted-foreground",
  "[&_div]:leading-7 [&_div]:text-muted-foreground",
  "[&_ul]:!list-disc [&_ol]:!list-decimal [&_ul]:!pl-5 [&_ol]:!pl-5 [&_li]:!my-2 [&_li]:!leading-7 [&_li]:marker:text-primary",
  "[&_table]:w-full [&_th]:text-left [&_th]:!text-foreground [&_td]:align-top [&_td]:py-2 [&_td]:pr-4",
  "[&_a]:text-primary [&_a]:underline [&_a]:font-medium [&_a]:rounded-sm [&_a]:transition-colors [&_a]:duration-200 [&_a:hover]:text-primary/80",
  "motion-reduce:[&_a]:transition-none",
  "[&_a:focus-visible]:outline-solid [&_a:focus-visible]:outline-2 [&_a:focus-visible]:outline-offset-2 [&_a:focus-visible]:outline-ring",
  "[&_hr]:!border-border",
];

const PolicyHtmlArticle: React.FC<PolicyHtmlArticleProps> = ({
  policyHtmlPath,
  ariaLabel,
  sanitizeHtml,
}) => {
  const rawPolicyHtml = readPolicyHtml(policyHtmlPath);
  const sanitizedPolicyHtml = sanitizeHtml
    ? sanitizeHtml(rawPolicyHtml)
    : rawPolicyHtml.trim();

  return (
    <section className="mx-auto flex w-full flex-col gap-8">
      <article
        className={`${shellClasses.join(" ")} ${contentClasses.join(" ")}`}
        aria-label={ariaLabel}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: sanitizedPolicyHtml }}
      />
    </section>
  );
};

export default PolicyHtmlArticle;
