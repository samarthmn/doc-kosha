import type { Metadata } from "next";

import contactCopy from "@/content/contact.json";

export const metadata: Metadata = {
  title: "Contact Us",
  description: contactCopy.subtitle,
  alternates: { canonical: "/contact" },
};

const ContactLayout = ({ children }: React.PropsWithChildren) => {
  return children;
};

export default ContactLayout;
