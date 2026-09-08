import ContactClient from "@/components/pages/ContactClient";
import type { Metadata } from "next";
import contactCopy from "@/content/contact.json";

export const metadata: Metadata = {
  title: "Contact Sales",
  description: contactCopy.subtitle,
  keywords: [
    "contact DocKosha",
    "DocKosha sales",
    "virtual data room demo",
    "secure document sharing demo",
  ],
  alternates: { canonical: "/contact" },
  openGraph: {
    type: "website",
    title: "Contact Sales",
    description: contactCopy.subtitle,
    url: "/contact",
  },
  twitter: {
    card: "summary_large_image",
    title: "Contact Sales",
    description: contactCopy.subtitle,
  },
};

const ContactPage: React.FC<PageProps<"/contact">> = () => {
  return <ContactClient />;
};

export default ContactPage;
