const config = {
  singleQuote: false,
  semi: true,
  plugins: ["prettier-plugin-tailwindcss"],
  overrides: [
    {
      files: ".github/workflows/ci.yml",
      options: { parser: "json" },
    },
  ],
  // Tailwind v4: class sorting is driven by the stylesheet, not a JS config.
  tailwindStylesheet: "./src/app/globals.css",
};

export default config;
