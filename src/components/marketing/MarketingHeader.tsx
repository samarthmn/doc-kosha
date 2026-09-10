"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { List, X } from "@phosphor-icons/react";
import HeaderButtons from "@/components/landingPage/HeaderButtons";
import Logo from "@/components/ui/logo";
import MarketingThemeToggle from "@/components/marketing/MarketingThemeToggle";
import { cn } from "@/lib/utils";

const MarketingHeader: React.FC = () => {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const navItems = [
    { href: "/blog/dockosha-open-source", label: "Open source" },
    { href: "/free-virtual-data-room", label: "Free VDR" },
    { href: "/pricing", label: "Pricing" },
    { href: "/features", label: "Features" },
    { href: "/demos", label: "Demos" },
    { href: "/security", label: "Security" },
    { href: "/blog", label: "Blog" },
    { href: "/faq", label: "FAQ" },
  ];

  const isActive = (href: string) => {
    if (href === "/blog" && pathname === "/blog/dockosha-open-source")
      return false;
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  // Close mobile menu when clicking on a link
  const handleNavLinkClick = () => {
    setIsMobileMenuOpen(false);
  };

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      // Ignore the toggle button: closing here on mousedown would race its
      // click handler (menu closes, then the click re-opens it).
      if (target.closest("[data-mobile-menu-trigger]")) return;
      if (isMobileMenuOpen && !target.closest(".mobile-menu-container")) {
        setIsMobileMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileMenuOpen]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previousOverflow = document.body.style.getPropertyValue("overflow");
    const previousPriority =
      document.body.style.getPropertyPriority("overflow");
    document.body.style.setProperty("overflow", "hidden");
    return () => {
      if (previousOverflow) {
        document.body.style.setProperty(
          "overflow",
          previousOverflow,
          previousPriority,
        );
        return;
      }
      document.body.style.removeProperty("overflow");
    };
  }, [isMobileMenuOpen]);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/92 backdrop-blur-xl">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2.5 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          onClick={closeMobileMenu}
        >
          <Logo className="h-[22px] w-[22px]" aria-hidden />
          <span className="text-base font-medium tracking-[-0.015em]">
            DocKosha
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav
          aria-label="Primary"
          className="hidden min-w-0 items-center gap-0.5 lg:flex"
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex h-8 items-center rounded-md px-2.5 text-[13px] font-normal text-muted-foreground transition-colors outline-none hover:bg-foreground/5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                isActive(item.href) && "bg-primary/8 text-primary",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Mobile Menu Button */}
        <div className="flex items-center gap-1 lg:hidden">
          <MarketingThemeToggle />
          <button
            type="button"
            data-mobile-menu-trigger
            onClick={toggleMobileMenu}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background outline-none hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
            aria-label="Toggle mobile menu"
            aria-expanded={isMobileMenuOpen}
          >
            {isMobileMenuOpen ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <List className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>

        {/* Desktop Header Buttons */}
        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          <MarketingThemeToggle />
          <HeaderButtons />
        </div>
      </div>

      {/* Mobile Navigation Menu */}
      {isMobileMenuOpen && (
        <div className="mobile-menu-container border-t border-border bg-[var(--dk-surface-overlay)] shadow-[var(--dk-shadow-dialog)] lg:hidden">
          <nav
            aria-label="Mobile primary"
            className="mx-auto max-h-[calc(100dvh-3.5rem)] w-full max-w-[1200px] overflow-y-auto px-4 py-4 sm:px-6"
          >
            <div className="flex flex-col gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={handleNavLinkClick}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-lg px-3 text-sm font-normal text-foreground transition-colors outline-none hover:bg-muted/70 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid",
                    isActive(item.href) &&
                      "bg-primary/10 text-primary shadow-[inset_2px_0_0_var(--primary)]",
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <div className="mt-3 border-t border-border pt-4">
                <HeaderButtons direction="col" />
              </div>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
};

export default MarketingHeader;
