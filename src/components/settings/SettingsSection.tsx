import * as React from "react";

interface SettingsSectionProps {
  kicker: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * The one section-header pattern for Settings tabs.
 *
 * Renders a `dk-nocturne-kicker` label, an h2 title, and an optional muted
 * one-line description OUTSIDE/ABOVE the surface cards for the section, then
 * lays `children` out below with `space-y-4`. Keep this header plain — no
 * icon chips — so every tab shares the same visual rhythm under the page's
 * h1 (`PageHeader`).
 */
export const SettingsSection: React.FC<SettingsSectionProps> = ({
  kicker,
  title,
  description,
  children,
}) => {
  const headingId = React.useId();

  return (
    <section className="space-y-5 pb-10" aria-labelledby={headingId}>
      <div className="max-w-2xl space-y-1">
        <p className="dk-nocturne-kicker">{kicker}</p>
        <h2 id={headingId} className="text-xl font-medium tracking-tight">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
};
