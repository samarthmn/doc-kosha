import testimonialsCopy from "@/content/testimonials.json";

type StaticTestimonial = (typeof testimonialsCopy.items)[number];

interface CustomerStorySection {
  title: string;
  body: string;
}

interface CustomerStoryLink {
  label: string;
  href: string;
}

interface CustomerStory {
  slug: string;
  href: string;
  title: string;
  description: string;
  publishedISO: string;
  updatedISO: string;
  customer: {
    name: string;
    role: string;
    company: string;
    workspace: string;
    headshotUploaded: boolean;
  };
  testimonial: StaticTestimonial;
  highlights: string[];
  sections: CustomerStorySection[];
  relatedLinks: CustomerStoryLink[];
  keywords: string[];
}

const getRequiredTestimonial = (id: string): StaticTestimonial => {
  const testimonial = testimonialsCopy.items.find(
    (item) => item.id === id && item.enabled,
  );

  if (!testimonial) {
    throw new Error(`Missing enabled testimonial: ${id}`);
  }

  return testimonial;
};

const lucasTestimonial = getRequiredTestimonial("lucas");

export const glHfCustomerStory: CustomerStory = {
  slug: "gl-hf-docsend-alternative",
  href: "/customers/gl-hf-docsend-alternative",
  title: "Why GL HF chose DocKosha as a lower-cost DocSend alternative",
  description:
    "Lucas from GL HF SRL switched from DocSend to DocKosha for customer-facing PDF sharing because DocKosha met the workflow requirements at a much lower price and shipped a requested client-side language option within days.",
  publishedISO: "2026-05-09T00:00:00.000Z",
  updatedISO: "2026-05-09T00:00:00.000Z",
  customer: {
    name: lucasTestimonial.name,
    role: lucasTestimonial.role,
    company: lucasTestimonial.company,
    workspace: "GL HF",
    headshotUploaded: false,
  },
  testimonial: lucasTestimonial,
  highlights: [
    "Moved from DocSend after the trial because the pricing was too high for the workflow.",
    "Found DocKosha easier to use while still meeting customer-facing PDF sharing requirements.",
    "Saw a requested customer-side language selection feature added within a few days.",
  ],
  sections: [
    {
      title: "The challenge: controlled PDF sharing without DocSend pricing",
      body: "GL HF needed a simple way to share PDFs with customers. Lucas first tried DocSend and liked the sharing experience, but the pricing after the trial made it hard to justify for the workflow.",
    },
    {
      title:
        "The switch: a lower-cost sharing workflow that still felt complete",
      body: "After researching alternatives, Lucas found DocKosha. The product met the sharing requirements at a much lower price compared with DocSend, while staying easier to use for day-to-day document delivery.",
    },
    {
      title: "The support moment: language selection shipped quickly",
      body: "Lucas suggested adding the ability to choose the language for the customer-facing side of the experience. The DocKosha team added the feature within a few days, turning a support request into a visible product improvement.",
    },
  ],
  relatedLinks: [
    {
      label: "Secure single-document sharing",
      href: "/features/single-document",
    },
    {
      label: "DocSend vs deal-room workflows",
      href: "/blog/docsend-vs-real-deal-room-lower-middle-market",
    },
    { label: "Pricing", href: "/pricing" },
  ],
  keywords: [
    "DocSend alternative",
    "DocSend pricing alternative",
    "affordable PDF sharing",
    "customer PDF sharing",
    "secure document sharing",
    "DocKosha testimonial",
  ],
};

export const customerStories = [glHfCustomerStory] as const;
