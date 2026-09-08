import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";
import Stripe from "stripe";
import { createSupabaseServiceClient } from "@/lib/supabase/serviceClient";
import { serverEnv } from "@/lib/env";
import { getStripeConfig } from "@/modules/billing/server/stripeClient";
import { findStripeCustomerByEmail } from "@/modules/billing/server/subscriptionSync";
import { DOCKOSHA_METADATA_KEYS } from "@/modules/billing/server/trialEligibility";
import { getR2Client, getR2Bucket } from "@/server/storage/r2Client";
import {
  STORAGE_BUCKET_NAME,
  CONVERTED_STORAGE_BUCKET_NAME,
  DATA_ROOM_STORAGE_BUCKET_NAME,
  DATA_ROOM_CONVERTED_BUCKET_NAME,
  BRANDING_ASSETS_BUCKET_NAME,
} from "@/lib/constants";

type StripeErrorLike = {
  code?: string;
  message?: string;
};

const isStripeResourceMissingError = (err: unknown): err is StripeErrorLike => {
  if (typeof err !== "object" || err === null) return false;
  if (!("code" in err)) return false;
  return (err as { code?: unknown }).code === "resource_missing";
};

const cancelSubscriptionWithStrategy = async (
  stripe: Stripe,
  subscription: Stripe.Subscription,
  immediate: boolean = false,
): Promise<void> => {
  if (subscription.status === "canceled") {
    return;
  }

  // For account deletion (immediate=true), always cancel right away.
  // For workspace-only deletion, allow trialing subs to expire at period end.
  if (subscription.status === "trialing" && !immediate) {
    await stripe.subscriptions.update(subscription.id, {
      cancel_at_period_end: true,
    });
    console.info(
      "[workspace-delete] Set trialing subscription to cancel at period end",
      subscription.id,
    );
    return;
  }

  await stripe.subscriptions.cancel(subscription.id, {
    invoice_now: false,
    prorate: false,
  });
  console.info(
    "[workspace-delete] Canceled subscription immediately",
    subscription.id,
  );
};

/**
 * Logical bucket names → R2 key prefixes (mirrors BUCKET_TO_PREFIX in r2Keys.ts).
 * All workspace files live under a single R2 bucket; logical separation is by prefix.
 */
const LOGICAL_BUCKET_PREFIXES: Record<string, string> = {
  [STORAGE_BUCKET_NAME]: "documents",
  [CONVERTED_STORAGE_BUCKET_NAME]: "converted-documents",
  [BRANDING_ASSETS_BUCKET_NAME]: "branding",
  [DATA_ROOM_STORAGE_BUCKET_NAME]: "data-room",
  [DATA_ROOM_CONVERTED_BUCKET_NAME]: "converted-data-room",
};

/**
 * Delete all R2 objects under every logical bucket prefix for the given workspace.
 * Uses ListObjectsV2 + DeleteObjects (max 1000 per call) against the native R2/MinIO bucket.
 */
const purgeR2WorkspaceObjects = async (
  workspaceId: string,
): Promise<{ deleted: number; errors: string[] }> => {
  const client = getR2Client();
  const bucket = getR2Bucket();
  const errors: string[] = [];
  let deleted = 0;

  for (const [logicalName, r2Prefix] of Object.entries(
    LOGICAL_BUCKET_PREFIXES,
  )) {
    const prefix = `${r2Prefix}/workspaces/${workspaceId}/`;
    let continuationToken: string | undefined;

    while (true) {
      // List errors break pagination — we can't advance without the response.
      let listResp: ListObjectsV2CommandOutput;
      try {
        listResp = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            MaxKeys: 1000,
            ContinuationToken: continuationToken,
          }),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        errors.push(`${logicalName} list: ${message}`);
        break;
      }

      const keys = (listResp.Contents ?? [])
        .map((obj) => obj.Key)
        .filter((k): k is string => typeof k === "string" && k.length > 0);

      if (keys.length > 0) {
        // Delete errors are recorded but do NOT break pagination — we continue
        // to attempt subsequent pages so we clean up as many objects as possible.
        try {
          const delResp = await client.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: {
                Objects: keys.map((Key) => ({ Key })),
                Quiet: true,
              },
            }),
          );

          const failedKeys = (delResp.Errors ?? []).map(
            (e) => e.Key ?? "<unknown>",
          );
          if (failedKeys.length > 0) {
            errors.push(
              `${logicalName}: failed to delete ${failedKeys.join(", ")}`,
            );
            deleted += keys.length - failedKeys.length;
          } else {
            deleted += keys.length;
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          errors.push(`${logicalName} delete: ${message}`);
        }
      }

      if (!listResp.IsTruncated) break;
      if (!listResp.NextContinuationToken) {
        const message =
          "ListObjectsV2 response is truncated but missing NextContinuationToken; aborting pagination to avoid infinite loop.";
        console.warn("[workspace-delete] R2 pagination guard tripped", {
          workspaceId,
          logicalName,
          prefix,
        });
        errors.push(`${logicalName} list: ${message}`);
        break;
      }
      continuationToken = listResp.NextContinuationToken;
    }
  }

  return { deleted, errors };
};

export class WorkspaceDeletionError extends Error {
  status: number;

  constructor(message: string, status: number = 500) {
    super(message);
    this.name = "WorkspaceDeletionError";
    this.status = status;
  }
}

type DeleteWorkspaceByIdParams = {
  workspaceId: string;
  userEmail: string | null;
  admin?: ReturnType<typeof createSupabaseServiceClient>;
  /**
   * When true, the deletion is part of a full account removal:
   * - trialing subscriptions are canceled immediately (not deferred to period end)
   * - the Stripe customer record is deleted rather than just tagged
   */
  isAccountDeletion?: boolean;
};

type DeleteWorkspaceByIdResult = {
  workspaceId: string;
  objectsDeleted: number;
};

export const deleteWorkspaceById = async (
  params: DeleteWorkspaceByIdParams,
): Promise<DeleteWorkspaceByIdResult> => {
  const { workspaceId, userEmail, isAccountDeletion = false } = params;
  const admin = params.admin ?? createSupabaseServiceClient();

  const { data: subscription } = await admin
    .from("workspace_subscriptions")
    .select("provider, provider_subscription_id, provider_customer_id")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const stripeSecretKey = serverEnv.STRIPE_SECRET_KEY;
  const hasStripeSubscription =
    subscription?.provider === "stripe" &&
    (subscription.provider_subscription_id ||
      subscription.provider_customer_id);
  const shouldTryEmailFallback =
    stripeSecretKey && userEmail && !hasStripeSubscription;

  if (hasStripeSubscription || shouldTryEmailFallback) {
    if (!stripeSecretKey) {
      console.error(
        "[workspace-delete] Cannot delete workspace with Stripe subscription when Stripe is not configured",
        { workspaceId },
      );
      throw new WorkspaceDeletionError(
        "Cannot delete workspace with active billing. Please contact support.",
      );
    }

    try {
      const { stripe } = getStripeConfig();
      const canceledSubscriptionIds: string[] = [];
      let customerId = subscription?.provider_customer_id ?? null;

      if (subscription?.provider_subscription_id) {
        try {
          const sub = await stripe.subscriptions.retrieve(
            subscription.provider_subscription_id,
          );
          await cancelSubscriptionWithStrategy(stripe, sub, isAccountDeletion);
          canceledSubscriptionIds.push(subscription.provider_subscription_id);
        } catch (err) {
          if (isStripeResourceMissingError(err)) {
            console.warn(
              "[workspace-delete] Stripe subscription not found; attempting customer fallback",
              {
                workspaceId,
                subscriptionId: subscription.provider_subscription_id,
              },
            );
          } else {
            throw err;
          }
        }
      }

      if (!customerId && userEmail) {
        const customerByEmail = await findStripeCustomerByEmail(
          stripe,
          userEmail,
        );
        if (customerByEmail) {
          customerId = customerByEmail.id;
          console.info(
            "[workspace-delete] Found Stripe customer by email fallback",
            {
              customerId,
            },
          );
        }
      }

      if (canceledSubscriptionIds.length === 0 && customerId) {
        try {
          const listed = await stripe.subscriptions.list({
            customer: customerId,
            status: "all",
            limit: 100,
          });

          const matching = (listed.data ?? []).filter(
            (sub) => sub.metadata?.workspace_id === workspaceId,
          );

          for (const sub of matching) {
            if (sub.status === "canceled") continue;
            try {
              await cancelSubscriptionWithStrategy(
                stripe,
                sub,
                isAccountDeletion,
              );
              canceledSubscriptionIds.push(sub.id);
            } catch (err) {
              if (isStripeResourceMissingError(err)) {
                console.warn(
                  "[workspace-delete] Stripe subscription missing during fallback cancel; continuing",
                  { workspaceId, subscriptionId: sub.id },
                );
              } else {
                throw err;
              }
            }
          }
        } catch (err) {
          if (isStripeResourceMissingError(err)) {
            console.warn(
              "[workspace-delete] Stripe customer not found during fallback; continuing",
              { workspaceId, customerId },
            );
          } else {
            throw err;
          }
        }
      }

      if (customerId) {
        if (isAccountDeletion) {
          // For full account deletion, hard-delete the Stripe customer so no
          // further charges or dunning emails can occur.
          try {
            await stripe.customers.del(customerId);
            console.info(
              "[workspace-delete] Deleted Stripe customer for account deletion",
              customerId,
            );
          } catch (err) {
            if (isStripeResourceMissingError(err)) {
              console.warn(
                "[workspace-delete] Stripe customer not found; skipping deletion",
                { workspaceId, customerId },
              );
            } else {
              console.warn(
                "[workspace-delete] Failed to delete Stripe customer; continuing",
                err,
              );
            }
          }
        } else {
          try {
            await stripe.customers.update(customerId, {
              metadata: {
                [DOCKOSHA_METADATA_KEYS.STATUS]: "workspace_deleted",
                dockosha_deleted_at: new Date().toISOString(),
                dockosha_workspace_id: workspaceId,
              },
            });
            console.info(
              "[workspace-delete] Updated Stripe customer metadata",
              customerId,
            );
          } catch (err) {
            if (isStripeResourceMissingError(err)) {
              console.warn(
                "[workspace-delete] Stripe customer not found; skipping metadata update",
                { workspaceId, customerId },
              );
            } else {
              console.warn(
                "[workspace-delete] Failed to update Stripe customer metadata; continuing",
                err,
              );
            }
          }
        }
      }

      if (
        canceledSubscriptionIds.length === 0 &&
        subscription?.provider_subscription_id
      ) {
        console.warn(
          "[workspace-delete] No Stripe subscription canceled for workspace; proceeding with deletion",
          {
            workspaceId,
            subscriptionId: subscription.provider_subscription_id,
            customerId: customerId ?? null,
          },
        );
      }
    } catch (stripeError) {
      console.error(
        "[workspace-delete] Failed to cancel Stripe subscription",
        stripeError,
      );
      throw new WorkspaceDeletionError("Failed to cancel billing subscription");
    }
  }

  const { deleted: totalDeleted, errors: storageErrors } =
    await purgeR2WorkspaceObjects(workspaceId);

  console.info(
    `[workspace-delete] Purged ${totalDeleted} R2 objects for workspace ${workspaceId}`,
  );

  if (storageErrors.length > 0) {
    console.error("[workspace-delete] R2 storage cleanup errors", {
      workspaceId,
      errors: storageErrors,
    });
    throw new WorkspaceDeletionError(
      "Failed to delete workspace files. Please try again.",
    );
  }

  const { error: cascadeDeleteError } = await admin.rpc(
    "delete_workspace_cascade",
    { p_workspace_id: workspaceId },
  );
  if (cascadeDeleteError) {
    console.error(
      "[workspace-delete] Failed to delete workspace via cascade RPC",
      { workspaceId },
      cascadeDeleteError,
    );
    throw new WorkspaceDeletionError(
      "Failed to delete workspace. Please try again.",
    );
  }

  console.info(
    "[workspace-delete] Successfully deleted workspace",
    workspaceId,
  );
  return {
    workspaceId,
    objectsDeleted: totalDeleted,
  };
};
