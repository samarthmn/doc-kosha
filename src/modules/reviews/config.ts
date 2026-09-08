export type ReviewSiteId = "capterra" | "g2" | "sourceforge" | "trustpilot";

export type ReviewSiteTier = "primary" | "secondary";

export type ReviewSite = {
  id: ReviewSiteId;
  label: string;
  href: string;
  priority: number;
  tier: ReviewSiteTier;
  description: string;
};

export const REVIEW_SITES: readonly ReviewSite[] = [
  {
    id: "capterra",
    label: "Capterra",
    href: "https://reviews.capterra.com/products/new/92a761b7-e488-42d3-bb55-974d78d04ec7/",
    priority: 1,
    tier: "primary",
    description:
      "Broad buyer reach for teams evaluating secure document tools.",
  },
  {
    id: "g2",
    label: "G2",
    href: "https://www.g2.com/products/dockosha-secure-document-sharing-virtual-data-rooms/reviews",
    priority: 2,
    tier: "primary",
    description:
      "Best for software buyers comparing DocKosha with alternatives.",
  },
  {
    id: "sourceforge",
    label: "SourceForge",
    href: "https://sourceforge.net/software/product/DocKosha/reviews/new",
    priority: 3,
    tier: "primary",
    description: "Software directory visibility for research-driven buyers.",
  },
  {
    id: "trustpilot",
    label: "Trustpilot",
    href: "https://www.trustpilot.com/evaluate/dockosha.com",
    priority: 4,
    tier: "primary",
    description: "Good for broad trust signals around the DocKosha brand.",
  },
];
