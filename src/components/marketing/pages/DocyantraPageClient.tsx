"use client";

import React from "react";
import docyantraCopy from "@/content/docyantra.json";
import MarketingSection from "@/components/marketing/layout/MarketingSection";
import MarketingContainer from "@/components/marketing/layout/MarketingContainer";
import MarketingHero from "@/components/marketing/MarketingHero";
import GlassCard from "@/components/marketing/GlassCard";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowRight,
  ChartBar,
  CheckCircle,
  Cpu,
  FileArrowUp,
  SealCheck,
  Shield,
  SlidersHorizontal,
} from "@phosphor-icons/react";

// Icons for the highlights section
const highlightIcons = [Cpu, Shield, ChartBar];

// Icons for the process section
const processIcons = [FileArrowUp, SlidersHorizontal, SealCheck];

export const DocyantraPageClient: React.FC = () => {
  const { hero, highlights, pillars, process, cta } = docyantraCopy;

  return (
    <>
      {/* Hero Section */}
      <MarketingHero
        badge={hero.badge}
        title={hero.title}
        subtitle={hero.subtitle}
        className="pt-24 pb-16"
      >
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <Link href={hero.primaryCta.href}>
              {hero.primaryCta.text}{" "}
              <ArrowRight aria-hidden className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href={hero.secondaryCta.href}>{hero.secondaryCta.text}</Link>
          </Button>
        </div>
      </MarketingHero>

      {/* Highlights Section */}
      <MarketingSection>
        <MarketingContainer>
          <div className="mb-16 grid gap-6 lg:grid-cols-[0.7fr_1fr] lg:items-end">
            <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
              Built for speed, fidelity, and fail-closed governance
            </h2>
            <p className="max-w-[58ch] text-[0.9375rem] leading-7 text-muted-foreground">
              DocYantra is the private processing engine inside DocKosha
              Cloud&apos;s validated Office and PDF path. It is not a standalone
              product or externally available package; work outside its
              documented envelope fails closed instead of degrading quietly.
            </p>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {highlights.map((item, index) => {
              const Icon = highlightIcons[index] || Cpu;
              return (
                <div
                  key={item.title}
                  className="flex flex-col items-start rounded-lg border bg-card p-6 [box-shadow:var(--dk-shadow-card)]"
                >
                  <div className="mb-6 rounded-md border border-primary/20 bg-primary/5 p-2.5 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h3 className="mb-2 text-xl font-medium">{item.title}</h3>
                  <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                  <ul className="mt-auto w-full space-y-2 rounded-lg bg-muted/30 p-4 pl-4 text-left text-sm text-muted-foreground">
                    {item.bullets.map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current text-primary" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Pillars Section */}
      <MarketingSection variant="muted" className="py-20">
        <MarketingContainer>
          <div className="grid gap-8 md:grid-cols-2">
            {pillars.map((pillar) => (
              <GlassCard key={pillar.title} className="p-8">
                <CardHeader className="p-0 pb-6">
                  <CardTitle className="text-2xl">{pillar.title}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ul className="grid gap-4">
                    {pillar.points.map((point) => (
                      <li key={point} className="flex gap-3">
                        <CheckCircle
                          aria-hidden
                          className="h-5 w-5 shrink-0 text-primary"
                        />
                        <span className="text-sm leading-relaxed text-muted-foreground">
                          {point}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </GlassCard>
            ))}
          </div>
        </MarketingContainer>
      </MarketingSection>

      {/* Process Section */}
      <MarketingSection className="py-20">
        <MarketingContainer>
          {process.map((flow) => (
            <div key={flow.title}>
              <div className="mb-12">
                <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
                  {flow.title}
                </h2>
              </div>
              <div className="relative grid gap-5 md:grid-cols-3">
                {flow.steps.map((step, index) => {
                  const Icon = processIcons[index] || FileArrowUp;
                  return (
                    <div
                      key={step.name}
                      className="relative rounded-lg border bg-background p-6 [box-shadow:var(--dk-shadow-card)]"
                    >
                      <div className="mb-6 flex items-center justify-between">
                        <span className="text-xs font-medium tracking-[0.12em] text-primary">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="rounded-md border border-primary/20 bg-primary/5 p-2 text-primary">
                          <Icon className="h-6 w-6" />
                        </div>
                      </div>
                      <h3 className="mb-3 text-lg font-medium">{step.name}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {step.summary}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </MarketingContainer>
      </MarketingSection>

      {/* CTA Section */}
      <MarketingSection className="pt-12 pb-24">
        <MarketingContainer size="sm">
          <div className="rounded-lg border border-primary/20 bg-primary/[0.035] p-8">
            <h2 className="text-3xl font-medium tracking-[-0.03em] md:text-4xl">
              {cta.title}
            </h2>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              {cta.subtitle}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Button asChild size="lg">
                <Link href={cta.primaryCta.href}>{cta.primaryCta.text}</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={cta.secondaryCta.href}>
                  {cta.secondaryCta.text}
                </Link>
              </Button>
            </div>
          </div>
        </MarketingContainer>
      </MarketingSection>
    </>
  );
};
