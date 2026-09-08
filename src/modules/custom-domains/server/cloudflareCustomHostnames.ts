/**
 * Cloudflare Custom Hostnames API client for SaaS custom domain provisioning.
 * Server-only - do not import in client code.
 *
 * Uses Cloudflare for SaaS to manage customer custom domains.
 * @see https://developers.cloudflare.com/api/resources/custom_hostnames/
 */

import { serverEnv } from "@/lib/env";

const CLOUDFLARE_API_BASE = "https://api.cloudflare.com/client/v4";

/**
 * SSL configuration for a custom hostname.
 */
type SslConfig = {
  id?: string;
  status?:
    | "initializing"
    | "pending_validation"
    | "pending_issuance"
    | "pending_deployment"
    | "active"
    | "pending_deletion"
    | "deleted";
  method?: "http" | "txt" | "email";
  type?: "dv";
  validation_records?: Array<{
    txt_name?: string;
    txt_value?: string;
    http_url?: string;
    http_body?: string;
    emails?: string[];
  }>;
  validation_errors?: Array<{
    message?: string;
  }>;
  certificate_authority?: string;
  settings?: {
    min_tls_version?: string;
    http2?: string;
    tls_1_3?: string;
  };
};

/**
 * Ownership verification record from Cloudflare.
 */
type OwnershipVerification = {
  type?: "txt";
  name?: string;
  value?: string;
};

type OwnershipVerificationHttp = {
  http_url?: string;
  http_body?: string;
};

/**
 * Custom hostname object returned by Cloudflare API.
 */
type CloudflareCustomHostname = {
  id: string;
  hostname: string;
  ssl?: SslConfig;
  status?:
    | "pending"
    | "active"
    | "active_redeploying"
    | "moved"
    | "pending_deletion"
    | "deleted"
    | "blocked";
  custom_metadata?: Record<string, string>;
  custom_origin_server?: string;
  custom_origin_sni?: string;
  ownership_verification?: OwnershipVerification;
  ownership_verification_http?: OwnershipVerificationHttp;
  verification_errors?: string[];
  created_at?: string;
};

/**
 * Response envelope for Cloudflare API.
 */
type CloudflareResponse<T> = {
  success: boolean;
  errors?: Array<{ code?: number; message?: string }>;
  messages?: Array<{ code?: number; message?: string }>;
  result?: T;
  result_info?: {
    page?: number;
    per_page?: number;
    count?: number;
    total_count?: number;
  };
};

type CloudflareApiError = {
  ok: false;
  error: string;
  code?: string;
  status?: number;
  isAuthError?: boolean;
  isPermissionError?: boolean;
};

export const CUSTOM_DOMAIN_CONFIGURATION_ERROR_CODE =
  "CUSTOM_DOMAIN_INTEGRATION_UNAVAILABLE" as const;

export type CloudflareCustomHostnameConfig = {
  apiToken: string;
  zoneId: string;
  fallbackOrigin: string;
  workerOriginSecret: string;
};

export type CloudflareCustomHostnameConfigurationError = {
  ok: false;
  error: "Custom domain integration is not configured.";
  code: typeof CUSTOM_DOMAIN_CONFIGURATION_ERROR_CODE;
  status: 503;
};

export type CloudflareCustomHostnameConfiguration =
  | { ok: true; config: CloudflareCustomHostnameConfig }
  | CloudflareCustomHostnameConfigurationError;

const getAuthHeaders = (): HeadersInit => {
  const token = serverEnv.CLOUDFLARE_API_TOKEN;
  if (!token) {
    throw new Error("CLOUDFLARE_API_TOKEN is not configured");
  }
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
};

const getZoneId = (): string => {
  const zoneId = serverEnv.CLOUDFLARE_ZONE_ID;
  if (!zoneId) {
    throw new Error("CLOUDFLARE_ZONE_ID is not configured");
  }
  return zoneId;
};

const classifyCloudflareError = (input: {
  status: number;
  code?: number;
}): Pick<CloudflareApiError, "isAuthError" | "isPermissionError"> => {
  if (input.status === 401 || input.code === 10000) {
    return { isAuthError: true };
  }
  if (input.status === 403) {
    return { isPermissionError: true };
  }
  return {};
};

const sleep = async (ms: number): Promise<void> =>
  await new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if Cloudflare Custom Hostnames integration is configured.
 */
export const isCloudflareConfigured = (): boolean => {
  return getCloudflareCustomHostnameConfiguration().ok;
};

/**
 * Validate the complete provider envelope at operation time. Cloudflare is
 * optional for application boot, but custom-domain operations must never
 * fall back to local emulation or an implicit DNS target.
 */
export const getCloudflareCustomHostnameConfiguration =
  (): CloudflareCustomHostnameConfiguration => {
    const apiToken = serverEnv.CLOUDFLARE_API_TOKEN;
    const zoneId = serverEnv.CLOUDFLARE_ZONE_ID;
    const fallbackOrigin = serverEnv.CLOUDFLARE_CUSTOM_HOSTNAME_FALLBACK_ORIGIN;
    const workerOriginSecret = serverEnv.CLOUDFLARE_WORKER_ORIGIN_SECRET;

    if (!apiToken || !zoneId || !fallbackOrigin || !workerOriginSecret) {
      return {
        ok: false,
        error: "Custom domain integration is not configured.",
        code: CUSTOM_DOMAIN_CONFIGURATION_ERROR_CODE,
        status: 503,
      };
    }

    return {
      ok: true,
      config: { apiToken, zoneId, fallbackOrigin, workerOriginSecret },
    };
  };

export const getCustomDomainConfigurationError =
  (): CloudflareCustomHostnameConfigurationError => ({
    ok: false,
    error: "Custom domain integration is not configured.",
    code: CUSTOM_DOMAIN_CONFIGURATION_ERROR_CODE,
    status: 503,
  });

/**
 * Get the fallback origin (CNAME target) for custom hostnames.
 */
export const getCnameTarget = (): string => {
  return serverEnv.CLOUDFLARE_CUSTOM_HOSTNAME_FALLBACK_ORIGIN || "";
};

/**
 * Create a custom hostname on Cloudflare.
 * POST /zones/:zone_id/custom_hostnames
 */
export const createCustomHostname = async (
  hostname: string,
  options?: {
    customMetadata?: Record<string, string>;
  },
): Promise<
  { ok: true; data: CloudflareCustomHostname } | CloudflareApiError
> => {
  if (!isCloudflareConfigured()) {
    return getCustomDomainConfigurationError();
  }

  const zoneId = getZoneId();
  const url = `${CLOUDFLARE_API_BASE}/zones/${zoneId}/custom_hostnames`;

  const postCustomHostname = async (
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; data: CloudflareCustomHostname }
    | (CloudflareApiError & { cloudflareErrorCode?: number })
  > => {
    const res = await fetch(url, {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });

    const data =
      (await res.json()) as CloudflareResponse<CloudflareCustomHostname>;

    if (!res.ok || !data.success) {
      const errMsg =
        data.errors?.[0]?.message || `Cloudflare API error: ${res.status}`;
      const errCode = data.errors?.[0]?.code?.toString();
      const errCodeNumber = data.errors?.[0]?.code;
      console.error("[cloudflareCustomHostnames] createCustomHostname failed", {
        status: res.status,
        errors: data.errors,
      });
      return {
        ok: false,
        error: errMsg,
        code: errCode,
        status: res.status,
        cloudflareErrorCode: errCodeNumber,
        ...classifyCloudflareError({ status: res.status, code: errCodeNumber }),
      };
    }

    if (!data.result) {
      return { ok: false, error: "No result returned from Cloudflare" };
    }

    return { ok: true, data: data.result };
  };

  try {
    const body: Record<string, unknown> = {
      hostname,
      ssl: {
        // Cloudflare uses this as the domain validation method for issuing SSL
        // certificates for the custom hostname (not ownership verification).
        type: "dv", // Domain validation
        method: "txt",
      },
    };

    if (options?.customMetadata) {
      body.custom_metadata = options.customMetadata;
    }

    const result = await postCustomHostname(body);

    // Cloudflare error 1413 happens when the account/zone isn't provisioned for
    // `custom_metadata`. It's optional for our product (we already persist the
    // mapping in Supabase), so gracefully retry without metadata.
    if (
      !result.ok &&
      typeof result.cloudflareErrorCode === "number" &&
      result.cloudflareErrorCode === 1413 &&
      "custom_metadata" in body
    ) {
      const bodyWithoutMetadata: Record<string, unknown> = { ...body };
      delete bodyWithoutMetadata.custom_metadata;
      console.warn(
        "[cloudflareCustomHostnames] createCustomHostname retrying without custom_metadata",
        { status: result.status, code: result.code, error: result.error },
      );
      const retry = await postCustomHostname(bodyWithoutMetadata);
      if (retry.ok) return retry;
      return retry;
    }

    return result;
  } catch (err) {
    console.error(
      "[cloudflareCustomHostnames] createCustomHostname failed",
      err,
    );
    return {
      ok: false,
      error: "Failed to create custom hostname on Cloudflare",
    };
  }
};

/**
 * Get a custom hostname by its hostname value.
 * GET /zones/:zone_id/custom_hostnames?hostname=...
 */
const getCustomHostnameByHostname = async (
  hostname: string,
): Promise<
  | { ok: true; data: CloudflareCustomHostname }
  | (CloudflareApiError & { notFound?: boolean })
> => {
  if (!isCloudflareConfigured()) {
    return getCustomDomainConfigurationError();
  }

  const zoneId = getZoneId();
  const url = `${CLOUDFLARE_API_BASE}/zones/${zoneId}/custom_hostnames?hostname=${encodeURIComponent(hostname)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: getAuthHeaders(),
    });

    const data = (await res.json()) as CloudflareResponse<
      CloudflareCustomHostname[]
    >;

    if (!res.ok || !data.success) {
      const errMsg =
        data.errors?.[0]?.message || `Cloudflare API error: ${res.status}`;
      const errCode = data.errors?.[0]?.code?.toString();
      const errCodeNumber = data.errors?.[0]?.code;
      console.error(
        "[cloudflareCustomHostnames] getCustomHostnameByHostname failed",
        { status: res.status, errors: data.errors },
      );
      return {
        ok: false,
        error: errMsg,
        code: errCode,
        status: res.status,
        ...classifyCloudflareError({ status: res.status, code: errCodeNumber }),
      };
    }

    const results = data.result || [];
    if (results.length === 0) {
      return {
        ok: false,
        error: "Custom hostname not found",
        notFound: true,
      };
    }

    return { ok: true, data: results[0] };
  } catch (err) {
    console.error(
      "[cloudflareCustomHostnames] getCustomHostnameByHostname failed",
      err,
    );
    return {
      ok: false,
      error: "Failed to get custom hostname from Cloudflare",
    };
  }
};

export const getCustomHostnameByHostnameWithRetry = async (
  hostname: string,
  options?: { attempts?: number; baseDelayMs?: number },
): Promise<
  | { ok: true; data: CloudflareCustomHostname }
  | (CloudflareApiError & { notFound?: boolean })
> => {
  const attempts = Math.max(1, options?.attempts ?? 4);
  const baseDelayMs = Math.max(150, options?.baseDelayMs ?? 700);

  let lastResult:
    | { ok: true; data: CloudflareCustomHostname }
    | (CloudflareApiError & { notFound?: boolean })
    | null = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await getCustomHostnameByHostname(hostname);
    if (result.ok) {
      return result;
    }

    lastResult = result;
    const shouldRetry = "notFound" in result && result.notFound;
    if (!shouldRetry || attempt === attempts - 1) {
      return result;
    }

    await sleep(baseDelayMs * (attempt + 1));
  }

  return (
    lastResult ?? {
      ok: false,
      error: "Custom hostname lookup failed",
    }
  );
};

/**
 * Refresh hostname validation by sending a PATCH with the same SSL config.
 * This triggers Cloudflare to re-check validation.
 * PATCH /zones/:zone_id/custom_hostnames/:custom_hostname_id
 */
export const refreshValidation = async (
  customHostnameId: string,
): Promise<
  { ok: true; data: CloudflareCustomHostname } | CloudflareApiError
> => {
  if (!isCloudflareConfigured()) {
    return getCustomDomainConfigurationError();
  }

  const zoneId = getZoneId();
  const url = `${CLOUDFLARE_API_BASE}/zones/${zoneId}/custom_hostnames/${customHostnameId}`;

  try {
    // Send PATCH with same SSL config to trigger re-validation
    const res = await fetch(url, {
      method: "PATCH",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ssl: {
          method: "txt",
          type: "dv",
        },
      }),
    });

    const data =
      (await res.json()) as CloudflareResponse<CloudflareCustomHostname>;

    if (!res.ok || !data.success) {
      const errMsg =
        data.errors?.[0]?.message || `Cloudflare API error: ${res.status}`;
      const errCode = data.errors?.[0]?.code?.toString();
      const errCodeNumber = data.errors?.[0]?.code;
      console.error("[cloudflareCustomHostnames] refreshValidation failed", {
        status: res.status,
        errors: data.errors,
      });
      return {
        ok: false,
        error: errMsg,
        code: errCode,
        status: res.status,
        ...classifyCloudflareError({ status: res.status, code: errCodeNumber }),
      };
    }

    if (!data.result) {
      return { ok: false, error: "No result returned from Cloudflare" };
    }

    return { ok: true, data: data.result };
  } catch (err) {
    console.error("[cloudflareCustomHostnames] refreshValidation failed", err);
    return { ok: false, error: "Failed to refresh validation on Cloudflare" };
  }
};

/**
 * Delete a custom hostname from Cloudflare.
 * DELETE /zones/:zone_id/custom_hostnames/:custom_hostname_id
 */
const deleteCustomHostname = async (
  customHostnameId: string,
): Promise<{ ok: true; id: string } | CloudflareApiError> => {
  if (!isCloudflareConfigured()) {
    return getCustomDomainConfigurationError();
  }

  const zoneId = getZoneId();
  const url = `${CLOUDFLARE_API_BASE}/zones/${zoneId}/custom_hostnames/${customHostnameId}`;

  try {
    const res = await fetch(url, {
      method: "DELETE",
      headers: getAuthHeaders(),
    });

    const data = (await res.json()) as CloudflareResponse<{ id: string }>;

    if (!res.ok || !data.success) {
      const errMsg =
        data.errors?.[0]?.message || `Cloudflare API error: ${res.status}`;
      const errCode = data.errors?.[0]?.code?.toString();
      const errCodeNumber = data.errors?.[0]?.code;
      console.error("[cloudflareCustomHostnames] deleteCustomHostname failed", {
        status: res.status,
        errors: data.errors,
      });
      return {
        ok: false,
        error: errMsg,
        code: errCode,
        status: res.status,
        ...classifyCloudflareError({ status: res.status, code: errCodeNumber }),
      };
    }

    return { ok: true, id: data.result?.id || customHostnameId };
  } catch (err) {
    console.error(
      "[cloudflareCustomHostnames] deleteCustomHostname failed",
      err,
    );
    return {
      ok: false,
      error: "Failed to delete custom hostname from Cloudflare",
    };
  }
};

/**
 * Delete a custom hostname by looking it up by hostname first.
 */
export const deleteCustomHostnameByHostname = async (
  hostname: string,
): Promise<{ ok: true; id: string } | CloudflareApiError> => {
  const lookup = await getCustomHostnameByHostname(hostname);
  if (!lookup.ok) {
    // If not found, consider it already deleted
    if ("notFound" in lookup && lookup.notFound) {
      return { ok: true, id: "" };
    }
    return lookup;
  }

  return deleteCustomHostname(lookup.data.id);
};

/**
 * Extract ownership verification TXT record details from a custom hostname.
 * Returns the TXT record name and value for `_cf-custom-hostname.<hostname>`.
 */
export const getOwnershipVerificationTxt = (
  hostname: CloudflareCustomHostname,
): { txtName: string; txtValue: string } | null => {
  const verification = hostname.ownership_verification;
  if (!verification?.name || !verification?.value) {
    return null;
  }
  return {
    txtName: verification.name,
    txtValue: verification.value,
  };
};

export const getSslValidationTxtRecords = (
  hostname: CloudflareCustomHostname,
): Array<{ txtName: string; txtValue: string }> => {
  const records = hostname.ssl?.validation_records ?? [];
  return records
    .map((r) => ({
      txtName: r.txt_name,
      txtValue: r.txt_value,
    }))
    .filter(
      (r): r is { txtName: string; txtValue: string } =>
        typeof r.txtName === "string" &&
        r.txtName.length > 0 &&
        typeof r.txtValue === "string" &&
        r.txtValue.length > 0,
    );
};

/**
 * Check if a custom hostname is fully active (both hostname and SSL).
 */
export const isHostnameActive = (
  hostname: CloudflareCustomHostname,
): boolean => {
  return hostname.status === "active" && hostname.ssl?.status === "active";
};

/**
 * Check if a custom hostname is pending validation.
 */
export const isHostnamePending = (
  hostname: CloudflareCustomHostname,
): boolean => {
  return (
    hostname.status === "pending" ||
    hostname.ssl?.status === "pending_validation" ||
    hostname.ssl?.status === "pending_issuance" ||
    hostname.ssl?.status === "pending_deployment"
  );
};
