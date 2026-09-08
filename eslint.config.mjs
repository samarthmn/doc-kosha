import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import tseslint from "typescript-eslint";

const eslintConfig = tseslint.config(
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "test-results/**",
      "mock-files/**",
      "supabase/**",
      "product-docs/**",
      "testing-docs/**",
      "plan/**",
      "AI Features/**",
      "next-env.d.ts",
      "src/types/generated/**",
      "package/**",
      "word-0.4.0.tgz",
      "public/**",
      "eslint.config.mjs",
      "next.config.ts",
      "playwright.config.ts",
      "**/*.config.ts",
      "*.config.*",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json",
        tsconfigRootDir: process.cwd(),
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  eslintPluginPrettierRecommended,
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "prettier/prettier": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "no-unused-vars": "off",
      "react/react-in-jsx-scope": "off",
      "react/jsx-uses-react": "off",
      "@next/next/no-img-element": "off",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
);

export default eslintConfig;
