import React from "react";
import PolicyHtmlArticle from "@/components/policies/PolicyHtmlArticle";

const PrivacyPolicyContent: React.FC = () => {
  return (
    <PolicyHtmlArticle
      policyHtmlPath="src/app/privacy-policy/policy.html"
      ariaLabel="DocKosha privacy policy"
    />
  );
};

export default PrivacyPolicyContent;
