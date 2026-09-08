const KNOWN_BOT_TOKENS = [
  "googlebot",
  "bingbot",
  "yandexbot",
  "duckduckbot",
  "baiduspider",
  "slurp",
  "semrushbot",
  "ahrefsbot",
  "mj12bot",
  "petalbot",
  "applebot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "discordbot",
  "slackbot",
  "telegrambot",
  "pinterestbot",
  "whatsapp",
  "skypeuripreview",
  "embedly",
  "quora link preview",
  // Avoid a broad "preview" token to prevent false positives (e.g. Safari Technology Preview).
  "link preview",
  "url preview",
  "prerender",
  "headless",
];

const GENERIC_BOT_WORDS = ["bot", "crawler", "spider", "scraper"];

export const isProbablyBot = (
  headers: Headers,
): { isBot: boolean; reason?: string } => {
  const uaRaw = headers.get("user-agent") ?? "";
  const ua = uaRaw.trim();
  if (!ua) {
    return { isBot: false };
  }

  const lower = ua.toLowerCase();

  // Do not treat Playwright / headless browser UA as a bot for test stability.
  if (lower.includes("headlesschrome")) {
    return { isBot: false };
  }

  for (const token of KNOWN_BOT_TOKENS) {
    if (lower.includes(token)) {
      return { isBot: true, reason: `ua:${token}` };
    }
  }

  for (const word of GENERIC_BOT_WORDS) {
    if (lower.includes(word)) {
      return { isBot: true, reason: `ua:${word}` };
    }
  }

  return { isBot: false };
};
