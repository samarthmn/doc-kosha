import "server-only";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const GENERIC_EMAIL = "viewer@example.com";
const GENERIC_DOMAINS = new Set(["example.com", "example.org", "example.net"]);

const sanitizeEmails = (markdown: string): string =>
  markdown.replace(EMAIL_PATTERN, (email) => {
    const domain = email.split("@")[1]?.toLowerCase() ?? "";
    return GENERIC_DOMAINS.has(domain) ? email : GENERIC_EMAIL;
  });

export const fetchDemoStepMarkdown = async (
  markdownUrl: string,
): Promise<string | null> => {
  try {
    const response = await fetch(markdownUrl, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return null;
    }

    const markdown = await response.text();
    return sanitizeEmails(markdown);
  } catch {
    return null;
  }
};
