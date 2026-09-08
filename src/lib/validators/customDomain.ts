import { z } from "zod";
import isValidDomain from "is-valid-domain";

/**
 * Validates a hostname using the is-valid-domain package.
 * Allows subdomains like documents.example.com
 */
export const isValidHostname = (value: string): boolean => {
  if (!value || value.length > 255) return false;
  // is-valid-domain validates domain names properly
  // subdomain: true allows subdomains like docs.example.com
  return isValidDomain(value, { subdomain: true });
};

export const createDomainInputSchema = z.object({
  workspaceId: z.string().uuid(),
  domain: z
    .string()
    .min(1)
    .max(255)
    .transform((s) => s.trim().toLowerCase())
    .refine(
      isValidHostname,
      "Enter a valid hostname like documents.example.com",
    ),
});

export const verifyDomainInputSchema = z.object({
  workspaceId: z.string().uuid(),
  domainId: z.string().uuid(),
});
