import React from "react";
import PolicyHtmlArticle from "@/components/policies/PolicyHtmlArticle";

const TermsAndConditionsContent: React.FC = () => {
  return (
    <PolicyHtmlArticle
      policyHtmlPath="src/app/terms-and-conditions/policy.html"
      ariaLabel="DocKosha terms and conditions"
    />
  );
};

export default TermsAndConditionsContent;
