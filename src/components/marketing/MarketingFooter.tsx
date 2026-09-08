import Logo from "@/components/ui/logo";
import Link from "next/link";

const MarketingFooter: React.FC = () => {
  return (
    <footer className="mt-auto border-t border-border/80 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="grid gap-10 md:grid-cols-[minmax(180px,1fr)_minmax(0,3fr)]">
          <div className="flex flex-col items-start gap-3">
            <div className="flex items-center gap-2.5">
              <Logo className="h-[22px] w-[22px]" aria-hidden />
              <span className="text-base font-medium tracking-[-0.015em]">
                DocKosha
              </span>
            </div>
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] text-muted-foreground sm:grid-cols-3 lg:grid-cols-4"
          >
            {[
              ["/", "Home"],
              ["/free-virtual-data-room", "Free VDR"],
              ["/pricing", "Pricing"],
              ["/hosted-vs-self-hosted", "Hosted vs self-hosted"],
              ["/features", "Features"],
              ["https://docs.dockosha.com", "Docs"],
              ["/secure-document-sharing", "Secure Sharing"],
              ["/dockosha-facts", "DocKosha Facts"],
              ["/security", "Security"],
              ["/security/subprocessors", "Subprocessors"],
              ["/security/questionnaire", "Security questionnaire"],
              ["/security/dpa", "DPA"],
              ["/privacy-policy", "Privacy Policy"],
              ["/cookie-policy", "Cookie Policy"],
              ["/terms-and-conditions", "Terms and Conditions"],
              ["https://github.com/samarthmn/doc-kosha", "Source"],
              [
                "https://github.com/samarthmn/doc-kosha/blob/main/LICENSE",
                "AGPL-3.0-or-later",
              ],
              [
                "mailto:contact@dockosha.com?subject=Enterprise%20License%20Inquiry",
                "Enterprise licensing",
              ],
            ].map(([href, label]) =>
              href.startsWith("http") || href.startsWith("mailto:") ? (
                <a
                  key={href}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-sm underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {label}
                </a>
              ) : (
                <Link
                  key={href}
                  href={href}
                  className="rounded-sm underline-offset-4 transition-colors hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  {label}
                </Link>
              ),
            )}
          </nav>
        </div>
        <div className="mt-10 h-px bg-[image:var(--dk-rule-fade)]" />
      </div>
    </footer>
  );
};

export default MarketingFooter;
