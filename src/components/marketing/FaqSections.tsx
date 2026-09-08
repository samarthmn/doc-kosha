import React from "react";
import { cn } from "@/lib/utils";

type FaqItem = {
  q: string;
  a: string;
};

export type FaqSection = {
  title: string;
  items: FaqItem[];
};

type FaqSectionsProps = {
  sections: FaqSection[];
  className?: string;
};

const FaqSections: React.FC<FaqSectionsProps> = ({ sections, className }) => {
  if (!sections.length) return null;

  return (
    <div className={cn("space-y-16", className)}>
      {sections.map((section) => (
        <section
          key={section.title}
          className="grid gap-7 lg:grid-cols-[minmax(12rem,0.38fr)_minmax(0,1fr)] lg:gap-14"
        >
          <div>
            <h2 className="text-2xl leading-tight font-medium tracking-[-0.02em]">
              {section.title}
            </h2>
          </div>

          <div className="border-t border-border/70">
            {section.items.map((item) => (
              <details key={item.q} className="group border-b border-border/70">
                <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between rounded-sm py-5 font-medium decoration-0 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid [&::-webkit-details-marker]:hidden">
                  <span className="pr-6 text-base leading-6 sm:text-lg">
                    {item.q}
                  </span>
                  <span className="flex size-7 shrink-0 items-center justify-center text-primary transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none">
                    <svg
                      className="size-4"
                      fill="none"
                      height="24"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="24"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </summary>
                <div className="max-w-[58ch] pb-6 text-[0.9375rem] leading-7 text-muted-foreground">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default FaqSections;
