import type { Metadata } from "next";
import dataRequestCopy from "@/content/dataRequest.json";
import { createSupabaseServerClient } from "@/lib/supabase/serverClient";
import DataRequestForm from "@/components/data-request/DataRequestForm";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import GlassCard from "@/components/marketing/GlassCard";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Data Request",
  description: dataRequestCopy.subtitle,
  keywords: [
    "data request",
    "data access request",
    "data deletion request",
    "DocKosha privacy",
  ],
  alternates: { canonical: "/data-request" },
  openGraph: {
    type: "website",
    title: "Data Request",
    description: dataRequestCopy.subtitle,
    url: "/data-request",
  },
  twitter: {
    card: "summary_large_image",
    title: "Data Request",
    description: dataRequestCopy.subtitle,
  },
};

const DataRequestPage: React.FC<PageProps<"/data-request">> = async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <MarketingShell>
      <MarketingHero
        badge={dataRequestCopy.badge}
        title={dataRequestCopy.title}
        subtitle={dataRequestCopy.subtitle}
      />

      <section className="pb-24">
        <div className="mx-auto grid max-w-[800px] gap-8 px-5 sm:px-8">
          <GlassCard className="p-2 sm:p-4">
            <CardHeader>
              <CardTitle>{dataRequestCopy.form.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <DataRequestForm userEmail={user?.email ?? null} />
            </CardContent>
          </GlassCard>
        </div>
      </section>
    </MarketingShell>
  );
};

export default DataRequestPage;
