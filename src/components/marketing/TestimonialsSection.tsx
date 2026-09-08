import { Quotes } from "@phosphor-icons/react/ssr";
import Link from "next/link";

import GlassCard from "@/components/marketing/GlassCard";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import testimonialsCopy from "@/content/testimonials.json";
import { cn } from "@/lib/utils";

type StaticTestimonial = (typeof testimonialsCopy.items)[number];

const enabledTestimonials = testimonialsCopy.items.filter(
  (item) => item.enabled,
);

const getInitials = (testimonial: StaticTestimonial): string => {
  const explicitInitials = testimonial.avatarInitials?.trim();
  if (explicitInitials) {
    return explicitInitials.slice(0, 3).toUpperCase();
  }

  return testimonial.name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 3)
    .toUpperCase();
};

const getAttribution = (testimonial: StaticTestimonial): string => {
  return `${testimonial.role}, ${testimonial.company}`;
};

const TestimonialAvatar: React.FC<{ testimonial: StaticTestimonial }> = ({
  testimonial,
}) => {
  return (
    <Avatar className="size-10 shrink-0 rounded-md border border-border shadow-none">
      <AvatarFallback className="rounded-md bg-primary/10 text-xs font-medium text-primary">
        {getInitials(testimonial)}
      </AvatarFallback>
    </Avatar>
  );
};

const TestimonialAttribution: React.FC<{ testimonial: StaticTestimonial }> = ({
  testimonial,
}) => {
  return (
    <figcaption className="flex items-start gap-3">
      <TestimonialAvatar testimonial={testimonial} />
      <div className="min-w-0 space-y-1">
        <cite className="block text-sm font-medium text-foreground not-italic">
          {testimonial.name}
        </cite>
        <p className="text-sm leading-5 text-muted-foreground">
          {getAttribution(testimonial)}
        </p>
        {testimonial.companyType ? (
          <p className="text-xs font-medium text-primary">
            {testimonial.companyType}
          </p>
        ) : null}
      </div>
    </figcaption>
  );
};

const FeaturedTestimonialCard: React.FC<{
  testimonial: StaticTestimonial;
}> = ({ testimonial }) => {
  return (
    <GlassCard className="relative flex min-h-[340px] flex-col p-6 sm:p-8">
      <div className="mb-8 flex size-9 items-center justify-center rounded-md border border-border bg-background text-primary">
        <Quotes className="size-4" aria-hidden="true" />
      </div>
      <figure className="flex flex-1 flex-col">
        <blockquote className="max-w-[34ch] text-[clamp(1.35rem,2.4vw,2rem)] leading-[1.35] font-medium tracking-[-0.02em] text-balance text-foreground">
          <p>&ldquo;{testimonial.quote}&rdquo;</p>
        </blockquote>
        <div className="mt-auto pt-10">
          <TestimonialAttribution testimonial={testimonial} />
          {testimonial.storyHref ? (
            <Button asChild variant="link" className="mt-6 h-auto p-0">
              <Link href={testimonial.storyHref}>Read customer story</Link>
            </Button>
          ) : null}
        </div>
      </figure>
    </GlassCard>
  );
};

const CompactTestimonialCard: React.FC<{
  testimonial: StaticTestimonial;
}> = ({ testimonial }) => {
  return (
    <GlassCard className="flex min-h-[220px] flex-col p-5 sm:p-6">
      <figure className="flex flex-1 flex-col">
        <blockquote className="text-base leading-7 font-normal text-balance text-foreground">
          <p>&ldquo;{testimonial.quote}&rdquo;</p>
        </blockquote>
        <div className="mt-auto pt-7">
          <TestimonialAttribution testimonial={testimonial} />
          {testimonial.storyHref ? (
            <Button asChild variant="link" className="mt-5 h-auto p-0 text-sm">
              <Link href={testimonial.storyHref}>Read customer story</Link>
            </Button>
          ) : null}
        </div>
      </figure>
    </GlassCard>
  );
};

export const TestimonialsSection: React.FC = () => {
  if (enabledTestimonials.length === 0) {
    return null;
  }

  const [featuredTestimonial, ...supportingTestimonials] = enabledTestimonials;

  return (
    <MarketingSection
      aria-describedby="homepage-testimonials-description"
      aria-labelledby="homepage-testimonials-title"
      className="py-24 lg:py-32"
      data-testid="homepage-testimonials"
      variant="brand"
    >
      <MarketingContainer>
        <div className="relative grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:items-start lg:gap-16">
          <div className="lg:sticky lg:top-28">
            <Badge
              variant="outline"
              className="mb-6 rounded-sm border-primary/30 bg-transparent px-2.5 py-1 text-[0.6875rem] tracking-[0.1em] text-primary uppercase"
            >
              {testimonialsCopy.eyebrow}
            </Badge>
            <h2
              id="homepage-testimonials-title"
              className="max-w-lg text-3xl leading-[1.12] font-medium tracking-[-0.03em] sm:text-4xl"
            >
              {testimonialsCopy.title}
            </h2>
            <p
              id="homepage-testimonials-description"
              className="mt-5 max-w-md text-[0.9375rem] leading-7 text-muted-foreground"
            >
              {testimonialsCopy.description}
            </p>
            <div className="mt-8 flex flex-wrap gap-2">
              {testimonialsCopy.tags.map((label) => (
                <span
                  key={label}
                  className="rounded-sm border border-border bg-background/40 px-2.5 py-1 text-xs text-muted-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="relative grid gap-5">
            <FeaturedTestimonialCard testimonial={featuredTestimonial} />
            {supportingTestimonials.length > 0 ? (
              <div
                className={cn(
                  "grid gap-5",
                  supportingTestimonials.length > 1 && "md:grid-cols-2",
                )}
              >
                {supportingTestimonials.map((testimonial) => (
                  <CompactTestimonialCard
                    key={testimonial.id}
                    testimonial={testimonial}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
};
