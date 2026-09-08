"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import OnboardingStep1, {
  OnboardingStep1Data,
} from "@/components/pages/onboarding/OnboardingStep1";
import OnboardingStep2 from "@/components/pages/onboarding/OnboardingStep2";
import { Button } from "@/components/ui/button";
import { createSupabaseBrowserClient } from "@/lib/supabase/browserClient";
import { hasEntitlementNow } from "@/modules/billing/entitlements";
import { sanitizeInternalReturnPath } from "@/lib/internalReturnPath";
import { Tables, TablesInsert } from "@/types/generated/supabase";
import { showError } from "@/lib/toast";
import { trackProductEvent } from "@/lib/analytics/productEvents";
import { PlanPickerSection } from "@/components/billing/PlanPickerSection";
import OnboardingGlassLayout from "./onboarding/OnboardingGlassLayout";
import { OnboardingStepHeader } from "@/components/onboarding/OnboardingStepHeader";
import { EnvelopeOpen, SpinnerGap } from "@phosphor-icons/react";
import {
  appendLandingAttribution,
  buildLandingAttributionProperties,
  getLandingAttribution,
} from "@/lib/analytics/landingAttribution";
import { resolveOnboardingFullName } from "@/modules/auth/onboardingProfile";

type OnboardingStep = "invite-choice" | "step-1" | "step-2" | "step-3";
type OnboardingStepState = OnboardingStep | "loading";

type Step1Data = OnboardingStep1Data;
type PlanStepData = {
  workspaceId: string;
  workspaceName: string | null;
  redirectPath: string;
};

type InviteContext = {
  invited: boolean;
  workspaceId: string | null;
  workspaceName: string | null;
  inviteId: string | null;
  hasPaidSubscription: boolean;
  source?: "explicit" | "accepted" | "pending_email";
};

const OnboardingClient: React.FC = () => {
  const [step, setStep] = useState<OnboardingStepState>("loading");
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [planStepData, setPlanStepData] = useState<PlanStepData | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const router = useRouter();
  const userProfile = useGlobalStore((s) => s.userProfile);
  const authUserEmail = useGlobalStore((s) => s.authUser?.email ?? null);
  const isAuthenticated = useGlobalStore((s) => s.isAuthenticated);
  const isLoading = useGlobalStore((s) => s.isLoading);
  const shouldFetchInitialData = useGlobalStore(
    (s) => s.shouldFetchInitialData,
  );
  const currentWorkspaceId = useGlobalStore((s) => s.currentWorkspaceId);
  const currentWorkspaceSubscription = useGlobalStore(
    (s) => s.currentWorkspaceSubscription,
  );
  const setUserProfile = useGlobalStore((s) => s.setUserProfile);
  const setWorkspaces = useGlobalStore((s) => s.setWorkspaces);
  const existingWorkspaces = useGlobalStore((s) => s.workspaces);
  const setCurrentWorkspaceId = useGlobalStore((s) => s.setCurrentWorkspaceId);
  const setIsUserOnboarded = useGlobalStore((s) => s.setIsUserOnboarded);
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const searchParams = useSearchParams();
  const redirectParam = searchParams?.get("redirect");
  const stepParam = searchParams?.get("step");
  const inviteParam = searchParams?.get("invite");
  const landingAttribution = useMemo(
    () => getLandingAttribution(searchParams),
    [searchParams],
  );
  const hasInviteParam = Boolean(inviteParam);
  const [inviteContext, setInviteContext] = useState<InviteContext | null>(
    null,
  );
  const [pendingInviteContext, setPendingInviteContext] =
    useState<InviteContext | null>(null);
  const [inviteDecision, setInviteDecision] = useState<
    "undecided" | "join" | "create"
  >("undecided");
  const [inviteContextLoaded, setInviteContextLoaded] =
    useState<boolean>(false);
  const [isInviteDecisionSubmitting, setIsInviteDecisionSubmitting] =
    useState(false);
  const hasMembershipFromStoreRef = useRef<boolean>(false);
  const inviteDecisionRef = useRef<"undecided" | "join" | "create">(
    inviteDecision,
  );

  useEffect(() => {
    hasMembershipFromStoreRef.current =
      Boolean(currentWorkspaceId) || existingWorkspaces.length > 0;
  }, [currentWorkspaceId, existingWorkspaces.length]);

  useEffect(() => {
    inviteDecisionRef.current = inviteDecision;
  }, [inviteDecision]);

  const currentWorkspace = useMemo(() => {
    if (!currentWorkspaceId) {
      return existingWorkspaces[0] ?? null;
    }
    return (
      existingWorkspaces.find(
        (workspace) => workspace.id === currentWorkspaceId,
      ) ?? null
    );
  }, [currentWorkspaceId, existingWorkspaces]);

  const workspaceLocked = useMemo(() => {
    if (inviteContext?.workspaceId) return true;
    if (!currentWorkspace || !userProfile?.id) return false;
    return currentWorkspace.created_by !== userProfile.id;
  }, [inviteContext?.workspaceId, currentWorkspace, userProfile?.id]);

  const lockedWorkspaceName = workspaceLocked
    ? (inviteContext?.workspaceName ?? currentWorkspace?.name ?? "Workspace")
    : (inviteContext?.workspaceName ?? currentWorkspace?.name ?? null);
  const authRedirectWithAttribution = useMemo(() => {
    const params = new URLSearchParams();
    params.set("redirect", "/onboarding");
    appendLandingAttribution(params, landingAttribution);
    return `/auth/sign-in?${params.toString()}`;
  }, [landingAttribution]);
  const defaultStep1Data = useMemo<Step1Data>(
    () => ({
      fullName: resolveOnboardingFullName({
        profileFullName: userProfile?.full_name,
        authEmail: authUserEmail,
      }),
      role: userProfile?.job_title ?? "",
      workspaceName:
        inviteContext?.workspaceName ??
        currentWorkspace?.name ??
        userProfile?.company ??
        "",
      industry: userProfile?.industry ?? "",
    }),
    [
      userProfile?.full_name,
      authUserEmail,
      userProfile?.job_title,
      userProfile?.company,
      userProfile?.industry,
      currentWorkspace?.name,
      inviteContext?.workspaceName,
    ],
  );
  const isIdentityHydrationPending = isLoading || shouldFetchInitialData;

  useEffect(() => {
    if (isIdentityHydrationPending || step1Data) return;
    setStep1Data(defaultStep1Data);
  }, [defaultStep1Data, isIdentityHydrationPending, step1Data]);

  useEffect(() => {
    if (
      step1Data &&
      workspaceLocked &&
      lockedWorkspaceName &&
      step1Data.workspaceName !== lockedWorkspaceName
    ) {
      setStep1Data((prev) =>
        prev ? { ...prev, workspaceName: lockedWorkspaceName } : prev,
      );
    }
  }, [step1Data, workspaceLocked, lockedWorkspaceName]);

  useEffect(() => {
    let active = true;
    const loadInviteContext = async () => {
      try {
        const qs = new URLSearchParams();
        if (inviteParam) {
          qs.set("invite", inviteParam);
        }
        const endpoint = qs.toString()
          ? `/api/onboarding/invite-context?${qs.toString()}`
          : "/api/onboarding/invite-context";

        const res = await fetch(endpoint);
        if (!res.ok) {
          throw new Error("Failed to load invite context");
        }
        const payload = (await res.json()) as InviteContext;
        if (!active) return;

        if (!payload.invited) {
          return;
        }

        if (inviteDecisionRef.current === "create") {
          return;
        }

        const hasMembershipFromStore = hasMembershipFromStoreRef.current;

        if (
          payload.source === "pending_email" &&
          !hasInviteParam &&
          !hasMembershipFromStore
        ) {
          setPendingInviteContext(payload);
          setInviteDecision("undecided");
          return;
        }

        setInviteContext(payload);
      } catch (err) {
        console.warn("[onboarding] invite context fetch failed", err);
      } finally {
        if (active) {
          setInviteContextLoaded(true);
        }
      }
    };
    void loadInviteContext();
    return () => {
      active = false;
    };
  }, [hasInviteParam, inviteParam]);
  const safeRedirectTarget =
    sanitizeInternalReturnPath(redirectParam) ?? "/dashboard";

  const isEntitled = useMemo(() => {
    if (inviteContext?.hasPaidSubscription) {
      return true;
    }
    return hasEntitlementNow(currentWorkspaceSubscription);
  }, [currentWorkspaceSubscription, inviteContext?.hasPaidSubscription]);

  const hasCompletedProfile = Boolean(userProfile?.primary_use_case);
  const hasMembership =
    Boolean(currentWorkspaceId) || existingWorkspaces.length > 0;

  useEffect(() => {
    // Only auto-skip onboarding if the user is already fully onboarded.
    // Otherwise (common for invited users), redirecting early can cause a dashboard↔onboarding loop.
    if (isAuthenticated && isEntitled && hasCompletedProfile && hasMembership) {
      router.replace(safeRedirectTarget);
    }
  }, [
    isAuthenticated,
    isEntitled,
    hasCompletedProfile,
    hasMembership,
    router,
    safeRedirectTarget,
  ]);

  useEffect(() => {
    if (step !== "loading") return;
    if (!inviteContextLoaded) return;

    if (pendingInviteContext && inviteDecision === "undecided") {
      setStep("invite-choice");
      return;
    }

    if (stepParam === "step-2") {
      setStep("step-2");
      return;
    }

    setStep("step-1");
  }, [
    inviteContextLoaded,
    inviteDecision,
    pendingInviteContext,
    step,
    stepParam,
  ]);

  const handlePendingInviteJoin = () => {
    if (!pendingInviteContext) return;
    setInviteContext(pendingInviteContext);
    setPendingInviteContext(null);
    setInviteDecision("join");
    setStep("step-1");
  };

  const handlePendingInviteCreateWorkspace = async () => {
    if (!pendingInviteContext) return;
    const inviteId = pendingInviteContext.inviteId;

    setIsInviteDecisionSubmitting(true);
    setInviteDecision("create");
    setPendingInviteContext(null);

    if (inviteId) {
      try {
        await fetch("/api/onboarding/reject-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteId }),
        });
      } catch (err) {
        console.warn("[onboarding] failed to reject invite", err);
      }
    }

    setIsInviteDecisionSubmitting(false);
    setStep("step-1");
  };

  const isMemberFlow = useMemo(() => {
    if (inviteContext?.workspaceId) return true;
    if (currentWorkspaceId) return true;
    if (existingWorkspaces.length > 0) return true;
    return false;
  }, [
    inviteContext?.workspaceId,
    currentWorkspaceId,
    existingWorkspaces.length,
  ]);

  const finalizeMemberOnboarding = async (data: Step1Data) => {
    setSubmissionError(null);
    setIsFinalizing(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace(authRedirectWithAttribution);
        return;
      }

      const { data: memberRows, error: memberError } = await supabase
        .from("workspace_members")
        .select("workspace:workspaces(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .order("workspace_id", { ascending: true })
        .limit(10);

      if (memberError) {
        console.warn(
          "[onboarding] membership lookup failed during member finalize",
          memberError,
        );
      }

      const hydrated = (memberRows ?? [])
        .map((entry) => entry.workspace)
        .filter(Boolean) as Tables<"workspaces">[];
      const hasWorkspaceMembership = hydrated.length > 0;

      // Defensive: if we incorrectly enter the "member" finalize path (e.g., due to
      // stale client state) but the user has no membership and no invite context,
      // fall back to the standard new-workspace onboarding flow.
      if (!hasWorkspaceMembership && !inviteContext?.workspaceId) {
        setStep("step-2");
        return;
      }

      if (hasWorkspaceMembership) {
        setWorkspaces(hydrated);
        setCurrentWorkspaceId(hydrated[0]!.id);
      } else if (inviteContext?.workspaceId) {
        setCurrentWorkspaceId(inviteContext.workspaceId);
      }

      // Member-invite onboarding: do not create/update a workspace, and skip plan.
      // Ensure the profile is "complete enough" for app guards by setting a default primary_use_case.
      const resolvedPrimaryUseCase = userProfile?.primary_use_case ?? "other";
      const derivedWorkspaceName =
        hydrated[0]?.name ?? lockedWorkspaceName ?? data.workspaceName;

      const profilePayload: TablesInsert<"profiles"> = {
        id: user.id,
        full_name: data.fullName,
        company: derivedWorkspaceName,
        industry: data.industry || null,
        job_title: data.role,
        primary_use_case: resolvedPrimaryUseCase,
      } as TablesInsert<"profiles">;

      const { data: upsertedProfile, error: profileError } = await supabase
        .from("profiles")
        .upsert(profilePayload, { onConflict: "id" })
        .select("*")
        .single();

      if (profileError) {
        throw new Error(profileError.message);
      }

      setUserProfile(upsertedProfile);
      setIsUserOnboarded(true);

      trackProductEvent("onboarding_completed", {
        workspace_id:
          inviteContext?.workspaceId ?? hydrated[0]?.id ?? undefined,
        flow: "member",
        primary_use_case: resolvedPrimaryUseCase,
        ...buildLandingAttributionProperties(landingAttribution),
      });

      // If we only know about the invite via email (no membership row yet),
      // route via /auth/callback to accept the invite and create membership first.
      if (!hasWorkspaceMembership && inviteContext?.inviteId) {
        const qs = new URLSearchParams();
        qs.set("redirect", safeRedirectTarget);
        qs.set("invite", inviteContext.inviteId);
        appendLandingAttribution(qs, landingAttribution);
        router.replace(`/auth/callback?${qs.toString()}`);
        return;
      }

      const destination =
        inviteContext?.hasPaidSubscription && hasWorkspaceMembership
          ? safeRedirectTarget
          : "/dashboard";
      router.replace(destination);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to finish onboarding. Please try again.";
      setSubmissionError(message);
      showError(message);
    } finally {
      setIsFinalizing(false);
    }
  };

  const handleStep1Continue = (data: Step1Data) => {
    if (isFinalizing) return;
    setStep1Data(data);
    if (isMemberFlow) {
      void finalizeMemberOnboarding(data);
      return;
    }
    setStep("step-2");
  };

  const handleCancel = async () => {
    await supabase.auth.signOut();
    router.replace(authRedirectWithAttribution);
  };

  const handleStep2Back = () => {
    setStep("step-1");
  };

  const sanitizeWorkspaceName = (value: string): string =>
    value ? value.replace(/[^A-Za-z ]/gi, "").replace(/\s+/g, " ") : "";

  const ensureWorkspace = async (
    authUserId: string,
    workspaceName: string,
  ): Promise<Tables<"workspaces">> => {
    const normalizedWorkspaceName = sanitizeWorkspaceName(workspaceName).trim();
    if (!normalizedWorkspaceName || normalizedWorkspaceName.length < 3) {
      throw new Error(
        "Workspace name must be at least 3 letters using A-Z characters and spaces only.",
      );
    }
    let workspace =
      existingWorkspaces.find((w) => w.id === currentWorkspaceId) ||
      existingWorkspaces[0] ||
      null;

    if (workspace) {
      if (workspace.name !== normalizedWorkspaceName) {
        const { data, error } = await supabase
          .from("workspaces")
          .update({ name: normalizedWorkspaceName })
          .eq("id", workspace.id)
          .select("*")
          .single();
        if (error) {
          throw new Error(
            error.message ||
              "We couldn’t update your workspace. Please try again.",
          );
        }
        if (data) {
          workspace = data;
        }
        setWorkspaces(
          existingWorkspaces.map((w) =>
            w.id === workspace.id ? workspace! : w,
          ),
        );
      }
      return workspace;
    }

    const { data: memberRows, error: memberError } = await supabase
      .from("workspace_members")
      .select("workspace:workspaces(*)")
      .eq("user_id", authUserId)
      .limit(10);
    if (memberError) {
      console.warn(
        "[onboarding] workspace membership lookup failed",
        memberError,
      );
    } else if (memberRows?.length) {
      const hydrated = memberRows
        .map((entry) => entry.workspace)
        .filter(Boolean) as Tables<"workspaces">[];
      if (hydrated.length > 0) {
        workspace = hydrated[0]!;
        setWorkspaces(hydrated);
        return workspace;
      }
    }

    const response = await fetch("/api/onboarding/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: normalizedWorkspaceName,
        userId: authUserId,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      // If user already has a workspace (409), re-fetch and return it
      if (response.status === 409) {
        const { data: retryMemberRows } = await supabase
          .from("workspace_members")
          .select("workspace:workspaces(*)")
          .eq("user_id", authUserId)
          .order("created_at", { ascending: true })
          .order("workspace_id", { ascending: true })
          .limit(1);

        const retryWorkspace = retryMemberRows?.[0]
          ?.workspace as Tables<"workspaces"> | null;
        if (retryWorkspace) {
          setWorkspaces([retryWorkspace]);
          return retryWorkspace;
        }
      }

      throw new Error(
        payload?.error ||
          "We couldn’t create your workspace. Please try again.",
      );
    }

    const createdWorkspace = (await response.json()) as Tables<"workspaces">;
    setWorkspaces([createdWorkspace]);
    return createdWorkspace;
  };

  const handleStep2Continue = async ({
    primaryUseCase,
    redirectPath,
  }: {
    primaryUseCase: string | null;
    redirectPath: string;
  }) => {
    // Safety check - should never happen if flow is correct
    if (!step1Data) {
      const message =
        "Profile information is missing. Please go back and fill in your details.";
      setSubmissionError(message);
      showError(message);
      return;
    }

    setSubmissionError(null);
    setIsFinalizing(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace(authRedirectWithAttribution);
        return;
      }

      // Step 1 + 2: Update profile + ensure workspace (in parallel for speed)
      const profilePayload: TablesInsert<"profiles"> = {
        id: user.id,
        full_name: step1Data.fullName,
        company: step1Data.workspaceName,
        industry: step1Data.industry || null,
        job_title: step1Data.role,
        primary_use_case: primaryUseCase,
      } as TablesInsert<"profiles">;

      const [{ data: upsertedProfile, error: profileError }, workspace] =
        await Promise.all([
          supabase
            .from("profiles")
            .upsert(profilePayload, { onConflict: "id" })
            .select("*")
            .single(),
          ensureWorkspace(user.id, step1Data.workspaceName),
        ]);

      if (profileError) {
        throw new Error(`Profile update failed: ${profileError.message}`);
      }
      setUserProfile(upsertedProfile);
      setCurrentWorkspaceId(workspace.id);
      setIsUserOnboarded(true);

      trackProductEvent("onboarding_completed", {
        workspace_id: workspace.id,
        flow: "new_workspace",
        primary_use_case: primaryUseCase,
        ...buildLandingAttributionProperties(landingAttribution),
      });

      setPlanStepData({
        workspaceId: workspace.id,
        workspaceName: workspace.name ?? null,
        redirectPath,
      });
      setStep("step-3");
      setIsFinalizing(false);
    } catch (err) {
      console.error("[onboarding] step 2 failed", err);
      const message =
        err instanceof Error
          ? err.message
          : "Unable to finish onboarding. Please try again.";
      setSubmissionError(message);
      showError(message);
      setIsFinalizing(false);
    }
  };

  if (
    step === "loading" ||
    !inviteContextLoaded ||
    isIdentityHydrationPending
  ) {
    return (
      <OnboardingGlassLayout>
        <div
          className="flex min-h-28 items-center gap-4"
          role="status"
          aria-live="polite"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded border border-primary/25 bg-primary/[0.06] text-primary">
            <SpinnerGap
              className="size-5 animate-spin motion-reduce:animate-none"
              aria-hidden
            />
          </div>
          <p className="text-sm text-muted-foreground">Preparing onboarding…</p>
        </div>
      </OnboardingGlassLayout>
    );
  }

  return (
    <>
      {step === "invite-choice" && pendingInviteContext && (
        <OnboardingGlassLayout>
          <div className="animate-in space-y-7 duration-500 fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
            <OnboardingStepHeader
              title="You’ve already been invited"
              description="Choose what you’d like to do next."
              trailing={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-muted-foreground hover:text-foreground"
                  onClick={handleCancel}
                >
                  Cancel
                </Button>
              }
            />

            <div className="relative overflow-hidden rounded-lg border border-border bg-card/55 p-5">
              <div
                className="absolute top-0 bottom-0 left-0 w-px bg-primary/60"
                aria-hidden
              />
              <div className="flex items-start gap-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded border border-primary/25 bg-primary/[0.06] text-primary">
                  <EnvelopeOpen className="size-[18px]" aria-hidden />
                </div>
                <div>
                  <div className="text-sm font-medium">Invitation</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Workspace:{" "}
                    <span className="font-medium text-foreground">
                      {pendingInviteContext.workspaceName ?? "Workspace"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:justify-end">
              <Button
                onClick={handlePendingInviteJoin}
                disabled={isInviteDecisionSubmitting}
                className="h-10 w-full sm:w-auto"
                size="lg"
              >
                Join this workspace
              </Button>
              <Button
                onClick={handlePendingInviteCreateWorkspace}
                variant="outline"
                disabled={isInviteDecisionSubmitting}
                className="h-10 w-full sm:w-auto"
                size="lg"
              >
                {isInviteDecisionSubmitting
                  ? "Saving…"
                  : "Create my own workspace"}
              </Button>
            </div>

            <p className="border-l border-border pl-3 text-xs leading-5 text-muted-foreground">
              If you create your own workspace, we’ll mark this invitation as
              rejected (you can still be re-invited later).
            </p>
          </div>
        </OnboardingGlassLayout>
      )}

      {step === "step-1" && (
        <OnboardingGlassLayout
          stepIndicator={isMemberFlow ? "1 of 1" : "1 of 3"}
        >
          <OnboardingStep1
            onContinue={handleStep1Continue}
            onCancel={handleCancel}
            initialData={step1Data ?? defaultStep1Data}
            workspaceLocked={workspaceLocked}
            lockedWorkspaceName={lockedWorkspaceName}
            isSubmitting={isFinalizing}
          />
        </OnboardingGlassLayout>
      )}

      {step === "step-2" && (
        <OnboardingGlassLayout stepIndicator="2 of 3" maxWidth="max-w-2xl">
          <OnboardingStep2
            onBack={handleStep2Back}
            onComplete={handleStep2Continue}
            isSubmitting={isFinalizing}
            errorMessage={submissionError}
            initialPrimaryUseCase={userProfile?.primary_use_case ?? null}
          />
        </OnboardingGlassLayout>
      )}

      {step === "step-3" && planStepData && (
        <OnboardingGlassLayout stepIndicator="3 of 3" maxWidth="max-w-6xl">
          <div className="animate-in space-y-8 duration-500 fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
            <PlanPickerSection
              workspaceId={planStepData.workspaceId}
              workspaceName={planStepData.workspaceName}
              redirectPath={planStepData.redirectPath}
              context="onboarding"
              attribution={landingAttribution}
              onBack={() => setStep("step-2")}
            />
          </div>
        </OnboardingGlassLayout>
      )}
    </>
  );
};

export default OnboardingClient;
