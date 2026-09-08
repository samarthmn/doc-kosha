"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import contactCopy from "@/content/contact.json";
import { CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { getCookie } from "@/lib/cookies";
import { CookieKeys } from "@/types/storage";
import MarketingShell from "@/components/marketing/MarketingShell";
import MarketingHero from "@/components/marketing/MarketingHero";
import GlassCard from "@/components/marketing/GlassCard";

const ContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Enter a valid email address"),
  company: z.string().max(200).optional().or(z.literal("")),
  subject: z.string().max(200).optional().or(z.literal("")),
  message: z.string().min(5, "Please enter at least 5 characters"),
});

type ContactValues = z.infer<typeof ContactSchema>;

const ContactClient: React.FC = () => {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactValues>({
    resolver: zodResolver(ContactSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      subject: "",
      message: "",
    },
  });
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [submitted, setSubmitted] = useState(false);
  const [showFormAgain, setShowFormAgain] = useState(false);
  const recentlySubmitted = useMemo(
    () => Boolean(getCookie(CookieKeys.ContactFormSubmitted)),
    [],
  );

  const showSuccess = submitted || (recentlySubmitted && !showFormAgain);

  const onSubmit = handleSubmit(async (values) => {
    setStatus("idle");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: unknown;
      };
      if (!res.ok || !json?.ok) {
        throw new Error(
          typeof json?.error === "string" ? json.error : contactCopy.form.error,
        );
      }
      setStatus("success");
      reset();
      setSubmitted(true);
    } catch (err) {
      setStatus("error");
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong. Please try again.";
      setError("root", { type: "server", message });
    }
  });

  return (
    <MarketingShell>
      <MarketingHero
        badge={contactCopy.badge}
        title={contactCopy.title}
        subtitle={contactCopy.subtitle}
      />

      <section className="pb-24">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-5 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          {/* Left Column: Context & Info */}
          <div className="flex flex-col justify-center space-y-8 lg:pr-12">
            <div>
              <h2 className="mb-6 text-3xl font-semibold tracking-tight md:text-4xl">
                Let&apos;s start a conversation
              </h2>
              <p className="text-lg leading-relaxed text-muted-foreground">
                Whether you have questions about features, pricing, or need a
                custom demo, our team is ready to answer all your questions.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="mt-1 flex size-9 shrink-0 items-center justify-center rounded-md border border-primary/20 bg-primary/5 text-primary">
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-medium">Email us</h3>
                  <p className="text-muted-foreground">support@dockosha.com</p>
                </div>
              </div>
            </div>

            <GlassCard className="border-primary/20 bg-primary/[0.035]">
              <CardContent className="flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h4 className="font-medium text-foreground">
                    Data Privacy Request?
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Access, export, correct, or delete your data.
                  </p>
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <Link href="/data-request">Data Requests</Link>
                </Button>
              </CardContent>
            </GlassCard>
          </div>

          {/* Right Column: Form */}
          <div className="lg:pl-8">
            {showSuccess ? (
              <GlassCard className="animate-fade-in-up flex h-full flex-col items-start justify-center p-8 sm:p-12">
                <div className="mb-6 flex size-14 items-center justify-center rounded-md border border-primary/20 bg-primary/5">
                  <CheckCircle aria-hidden className="h-10 w-10 text-primary" />
                </div>
                <h3 className="mb-3 text-2xl font-semibold">Message Sent!</h3>
                <p className="mb-8 max-w-sm text-lg text-muted-foreground">
                  {contactCopy.form.success}
                </p>
                <div className="flex w-full max-w-xs flex-col gap-3">
                  <Button asChild className="w-full" size="lg">
                    <Link href="/">Back to Home</Link>
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setSubmitted(false);
                      setShowFormAgain(true);
                    }}
                  >
                    Send another message
                  </Button>
                </div>
              </GlassCard>
            ) : (
              <GlassCard className="h-full border-border">
                <CardHeader className="px-6 pt-7 pb-4 sm:px-8">
                  <CardTitle className="text-2xl font-medium">
                    {contactCopy.form.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 sm:p-8">
                  <form onSubmit={onSubmit} className="grid gap-5" noValidate>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label
                          htmlFor="name"
                          className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
                        >
                          Name
                        </Label>
                        <Input
                          id="name"
                          placeholder="John Doe"
                          className="h-11 bg-background/50 backdrop-blur-sm"
                          aria-invalid={!!errors.name}
                          aria-describedby={
                            errors.name ? "name-error" : undefined
                          }
                          {...register("name")}
                        />
                        {errors.name?.message && (
                          <span
                            id="name-error"
                            className="text-xs text-destructive"
                          >
                            {errors.name.message}
                          </span>
                        )}
                      </div>
                      <div className="grid gap-2">
                        <Label
                          htmlFor="email"
                          className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
                        >
                          Email
                        </Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="john@company.com"
                          className="h-11 bg-background/50 backdrop-blur-sm"
                          aria-invalid={!!errors.email}
                          aria-describedby={
                            errors.email ? "email-error" : undefined
                          }
                          {...register("email")}
                        />
                        {errors.email?.message && (
                          <span
                            id="email-error"
                            className="text-xs text-destructive"
                          >
                            {errors.email.message}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label
                        htmlFor="company"
                        className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
                      >
                        Company
                      </Label>
                      <Input
                        id="company"
                        placeholder="Company Name (Optional)"
                        className="h-11 bg-background/50 backdrop-blur-sm"
                        {...register("company")}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label
                        htmlFor="subject"
                        className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
                      >
                        Subject
                      </Label>
                      <Input
                        id="subject"
                        placeholder="What is this regarding?"
                        className="h-11 bg-background/50 backdrop-blur-sm"
                        {...register("subject")}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label
                        htmlFor="message"
                        className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
                      >
                        Message
                      </Label>
                      <Textarea
                        id="message"
                        placeholder="Tell us about your project or inquiry..."
                        rows={5}
                        className="resize-none bg-background/50 backdrop-blur-sm"
                        aria-invalid={!!errors.message}
                        aria-describedby={
                          errors.message ? "message-error" : undefined
                        }
                        {...register("message")}
                      />
                      {errors.message?.message && (
                        <span
                          id="message-error"
                          className="text-xs text-destructive"
                        >
                          {errors.message.message}
                        </span>
                      )}
                    </div>

                    <div className="mt-2">
                      <Button
                        type="submit"
                        size="lg"
                        className="h-12 w-full text-base"
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? "Sending Message..." : "Send Message"}
                      </Button>

                      <div className="mt-4 flex flex-col items-center">
                        {errors.root?.message && (
                          <span className="text-center text-sm text-destructive">
                            {errors.root.message}
                          </span>
                        )}
                        {status === "error" && !errors.root?.message && (
                          <span className="text-center text-sm text-destructive">
                            {contactCopy.form.error}
                          </span>
                        )}
                      </div>
                    </div>
                  </form>
                </CardContent>
              </GlassCard>
            )}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
};

export default ContactClient;
