export const THEMES = [
  { value: "system", label: "System", description: "Follow system preference" },
  { value: "light", label: "Light", description: "Clean and bright" },
  { value: "dark", label: "Dark", description: "Easy on the eyes" },
  { value: "copper", label: "Copper", description: "Warm and professional" },
  { value: "forest", label: "Forest", description: "Natural and calming" },
  { value: "lavender", label: "Lavender", description: "Soft and elegant" },
  { value: "midnight", label: "Midnight", description: "Deep and focused" },
  { value: "ocean", label: "Ocean", description: "Fresh and modern" },
  { value: "sunset", label: "Sunset", description: "Warm and energetic" },
] as const;

export type Theme = (typeof THEMES)[number]["value"];

// "system" is resolved to light/dark at runtime and never applied as a class.
export const THEME_CLASS_NAMES = THEMES.filter((t) => t.value !== "system").map(
  (t) => t.value,
);
