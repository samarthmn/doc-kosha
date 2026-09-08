import { redirect } from "next/navigation";
import { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";

const LegacyPlanPage: React.FC<PageProps<"/plan">> = async ({
  searchParams,
}) => {
  const params = (await searchParams) ?? {};
  const redirectValue = Array.isArray(params.redirect)
    ? params.redirect[0]
    : params.redirect;
  const redirectParam = sanitizeInternalReturnPath(redirectValue);
  const next = new URLSearchParams();
  next.set("tab", "subscription");
  next.set("planPicker", "1");
  if (redirectParam) {
    next.set("redirect", redirectParam);
  }
  redirect(`/settings?${next.toString()}`);
};

export default LegacyPlanPage;
