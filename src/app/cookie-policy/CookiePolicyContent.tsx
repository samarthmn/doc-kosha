import React from "react";
import PolicyHtmlArticle from "@/components/policies/PolicyHtmlArticle";

const sanitizePolicyHtml = (html: string) => {
  const withoutStyles = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
  const withoutSpans = withoutStyles.replace(/<\/?span\b[^>]*>/gi, "");
  const withoutStrongWrappedHeadings = withoutSpans
    .replace(/<strong>\s*(<(h[1-6])\b[^>]*>)/gi, "$1")
    .replace(/<\/(h[1-6])>\s*<\/strong>/gi, "</$1>");

  return withoutStrongWrappedHeadings.trim();
};

const CookiePolicyContent: React.FC = () => {
  return (
    <PolicyHtmlArticle
      policyHtmlPath="src/app/cookie-policy/policy.html"
      ariaLabel="DocKosha cookie policy"
      sanitizeHtml={sanitizePolicyHtml}
    />
  );
};

export default CookiePolicyContent;
