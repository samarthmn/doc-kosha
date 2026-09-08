"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/useAuth";
import { useGlobalStore } from "@/providers/globalStoreProvider";
import { showError } from "@/lib/toast";
import {
  ArrowLeft,
  EnvelopeSimple,
  GoogleLogo,
  SpinnerGap,
  X,
} from "@phosphor-icons/react";
import { z } from "zod";
import AuthGlassLayout from "./AuthGlassLayout";
import { getLandingAttribution } from "@/lib/analytics/landingAttribution";

type AuthStep = "auth" | "verify";

type AuthPageProps = {
  inviteWorkspaceName?: string | null;
};

const AuthPage: React.FC<AuthPageProps> = ({ inviteWorkspaceName }) => {
  const [step, setStep] = useState<AuthStep>("auth");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [showLinkError, setShowLinkError] = useState(() =>
    Boolean(searchParams.get("error")),
  );
  const { signIn } = useAuth();
  const setShouldFetchInitialData = useGlobalStore(
    (s) => s.setShouldFetchInitialData,
  );

  React.useEffect(() => {
    if (resendCooldownSec <= 0) return;
    const t = setInterval(() => {
      setResendCooldownSec((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(t);
  }, [resendCooldownSec]);

  const handleMagicLink = async () => {
    if (!email) return;
    if (!z.string().email().safeParse(email).success) {
      setEmailError("Enter a valid email address.");
      return;
    }
    setEmailError(null);
    setIsLoading(true);
    try {
      await signIn.magicLink(email);
      setStep("verify");
      setResendCooldownSec(30);
    } catch (error) {
      console.error("[AuthPage] Failed to send magic link", error);
      showError("Failed to send magic link. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!email || otp.length === 0) return;
    setIsLoading(true);
    try {
      setOtpError(null);
      await signIn.verifyOtp(email, otp);
    } catch (error) {
      console.error("[AuthPage] Failed to verify OTP", error);
      setOtpError("Invalid or expired code. Please check and try again.");
      showError("Failed to verify OTP. Please try again.");
    } finally {
      setShouldFetchInitialData(true);
      setIsLoading(false);
    }
  };

  const handleGoogle = async () => {
    setIsLoading(true);
    try {
      await signIn.google();
    } catch (error) {
      console.error("[AuthPage] Failed to sign in with Google", error);
      showError("Failed to sign in with Google. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const isInviteFlow = Boolean(inviteWorkspaceName);
  // Any recognized marketing source signals sign-up intent, not a returning user.
  const isLandingFlow = Boolean(getLandingAttribution(searchParams).source);
  const heading = isInviteFlow
    ? `Join ${inviteWorkspaceName ?? "this workspace"}`
    : isLandingFlow
      ? "Start Free"
      : "Welcome back";
  const subheading = isInviteFlow
    ? `Please sign in to continue to ${
        inviteWorkspaceName ?? "this workspace"
      }.`
    : isLandingFlow
      ? "Create your account on the free forever plan. No credit card required."
      : "Enter your email to sign in to your account";

  return (
    <AuthGlassLayout>
      {step === "auth" ? (
        <div className="animate-in space-y-7 duration-500 fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
          <div className="space-y-3">
            {isInviteFlow && (
              <span className="dk-nocturne-kicker inline-flex items-center gap-2">
                <span className="h-px w-7 bg-primary/70" aria-hidden="true" />
                Workspace invite
              </span>
            )}
            <h1 className="text-[2rem] leading-tight font-medium tracking-[-0.025em] text-balance">
              {heading}
            </h1>
            <p className="max-w-[36ch] text-[15px] leading-6 text-muted-foreground">
              {subheading}
            </p>
          </div>

          {showLinkError && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-lg border border-destructive/35 bg-destructive/[0.07] px-4 py-3.5 text-sm leading-5 text-destructive"
            >
              <p>
                Your sign-in link is invalid or has expired. Enter your email to
                get a new one.
              </p>
              <button
                type="button"
                onClick={() => setShowLinkError(false)}
                aria-label="Dismiss sign-in link error"
                className="mt-0.5 shrink-0 rounded transition-colors outline-none hover:bg-destructive/10 hover:text-destructive/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:outline-solid"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          )}

          <div className="space-y-5">
            <Button
              className="h-11 w-full justify-between px-4"
              variant="outline"
              onClick={handleGoogle}
              disabled={isLoading}
              size="lg"
            >
              <span className="flex items-center gap-2.5">
                <GoogleLogo className="size-[18px]" weight="bold" aria-hidden />
                Continue with Google
              </span>
              <ArrowLeft
                className="size-4 rotate-180 text-muted-foreground"
                aria-hidden
              />
            </Button>

            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <div className="text-[10px] font-medium tracking-[0.1em] uppercase">
                <span className="text-muted-foreground">Or continue with</span>
              </div>
              <Separator className="flex-1" />
            </div>

            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handleMagicLink();
              }}
            >
              <div className="space-y-2.5">
                <Label htmlFor="email" className="text-xs font-medium">
                  Email
                </Label>
                <div className="relative">
                  <EnvelopeSimple
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden
                  />
                  <Input
                    id="email"
                    type="email"
                    placeholder="m@example.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (emailError) setEmailError(null);
                    }}
                    autoComplete="email"
                    aria-invalid={Boolean(emailError)}
                    aria-describedby={emailError ? "email-error" : undefined}
                    className="h-11 bg-card pl-10 text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                {emailError && (
                  <p
                    id="email-error"
                    className="text-xs leading-5 text-destructive"
                    role="alert"
                  >
                    {emailError}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                className="h-11 w-full"
                disabled={!email || isLoading}
                size="lg"
              >
                {isLoading && (
                  <SpinnerGap
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                )}
                {isLandingFlow ? "Continue with Email" : "Sign In with Email"}
              </Button>
            </form>
            <p className="border-l border-border pl-3 text-xs leading-5 text-muted-foreground">
              By continuing, you agree to our{" "}
              <Link
                href="/terms-and-conditions"
                className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy-policy"
                className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Privacy Policy
              </Link>
              .
              <span className="mt-2 block">
                Looking for security details?{" "}
                <Link
                  href="/security"
                  className="rounded-sm underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Read our Security overview
                </Link>
                .
              </span>
            </p>
          </div>

          <div className="flex">
            <Button
              variant="link"
              className="h-auto gap-2 px-0 py-1 text-muted-foreground"
              onClick={() => router.replace("/")}
            >
              <ArrowLeft className="size-4" aria-hidden />
              Back to home
            </Button>
          </div>
        </div>
      ) : (
        <div className="animate-in space-y-7 duration-500 fade-in slide-in-from-right-2 motion-reduce:animate-none">
          <div className="space-y-3">
            <h1 className="text-[2rem] leading-tight font-medium tracking-[-0.025em]">
              Check your email
            </h1>
            <p className="max-w-[38ch] text-[15px] leading-6 text-muted-foreground">
              We sent a code to <span className="font-medium">{email}</span>.
              Enter it below to sign in.
            </p>
          </div>

          <div className="space-y-4">
            <form
              className="space-y-5"
              onSubmit={(e) => {
                e.preventDefault();
                void handleVerifyOtp();
              }}
            >
              <div className="space-y-2.5">
                <Label htmlFor="otp" className="text-xs font-medium">
                  One-Time Password
                </Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  value={otp}
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6));
                    if (otpError) setOtpError(null);
                  }}
                  aria-invalid={Boolean(otpError)}
                  aria-describedby={otpError ? "otp-error" : undefined}
                  className="h-12 bg-card text-center text-xl font-medium tracking-[0.38em] text-foreground placeholder:text-muted-foreground"
                />
                {otpError && (
                  <p
                    id="otp-error"
                    className="text-xs leading-5 text-destructive"
                    role="alert"
                  >
                    {otpError}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="h-11 w-full"
                disabled={!email || !otp || isLoading}
                size="lg"
              >
                {isLoading && (
                  <SpinnerGap
                    className="size-4 animate-spin motion-reduce:animate-none"
                    aria-hidden
                  />
                )}
                Verify Code
              </Button>
            </form>

            <div className="flex flex-col-reverse items-stretch justify-between gap-2 text-sm sm:flex-row sm:items-center">
              <Button
                variant="ghost"
                onClick={() => setStep("auth")}
                className="justify-start px-2 text-muted-foreground"
              >
                <ArrowLeft className="size-4" aria-hidden />
                Change email
              </Button>
              <Button
                variant="ghost"
                onClick={() => void handleMagicLink()}
                disabled={isLoading || resendCooldownSec > 0}
                className="justify-start px-2 text-muted-foreground sm:justify-end"
              >
                {resendCooldownSec > 0
                  ? `Resend in ${resendCooldownSec}s`
                  : "Resend code"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AuthGlassLayout>
  );
};

export default AuthPage;
