export const uniqueEmail = (prefix: string): string =>
  `${prefix}+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

export const uniqueName = (prefix: string): string =>
  `${prefix} ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`;

export const uniqueLettersName = (prefix: string): string => {
  const alphabet = "abcdefghijklmnopqrstuvwxyz";
  const suffix = Array.from(
    { length: 8 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
  return `${prefix} ${suffix}`;
};
