"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

interface DataRequestFormProps {
  userEmail?: string | null;
}

const RequestTypeSchema = z.enum([
  "access",
  "correction",
  "deletion",
  "export",
  "consent_withdrawal",
  "other",
]);

const DataRequestSchema = z
  .object({
    email: z.string().email("Enter a valid email address").optional(),
    requestType: RequestTypeSchema,
    details: z
      .string()
      .min(10, "Please enter at least 10 characters")
      .max(2000),
  })
  .superRefine((value, ctx) => {
    if (!value.email) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Email is required",
        path: ["email"],
      });
    }
  });

type DataRequestValues = z.infer<typeof DataRequestSchema>;

const DataRequestForm: React.FC<DataRequestFormProps> = ({ userEmail }) => {
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
    reset,
  } = useForm<DataRequestValues>({
    resolver: zodResolver(DataRequestSchema),
    defaultValues: {
      email: userEmail ?? "",
      requestType: "access",
      details: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    if (status === "submitting") return;
    setStatus("submitting");

    try {
      const res = await fetch("/api/data-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: values.requestType,
          details: values.details,
          email: userEmail ?? values.email,
        }),
      });

      if (res.ok) {
        setStatus("success");
        reset({
          email: userEmail ?? values.email,
          requestType: values.requestType,
          details: "",
        });
        return;
      }

      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      setError("root", {
        type: "server",
        message: data?.error ?? "Something went wrong. Please try again.",
      });
      setStatus("error");
    } catch {
      setError("root", {
        type: "network",
        message: "Network error. Please check your connection and try again.",
      });
      setStatus("error");
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        {userEmail ? (
          <>
            <Input id="email" type="email" disabled value={userEmail} />
            <input
              type="hidden"
              defaultValue={userEmail}
              {...register("email")}
            />
          </>
        ) : (
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email")}
          />
        )}
        {errors.email?.message ? (
          <p id="email-error" className="text-sm text-destructive">
            {errors.email.message}
          </p>
        ) : userEmail ? (
          <p className="text-xs text-muted-foreground">
            Submitting from your signed-in account.
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="request-type">Request type</Label>
        <select
          id="request-type"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          aria-invalid={!!errors.requestType}
          {...register("requestType")}
        >
          <option value="access">Access my data</option>
          <option value="correction">Correct my data</option>
          <option value="deletion">Delete my data</option>
          <option value="export">Export/port my data</option>
          <option value="consent_withdrawal">Withdraw consent</option>
          <option value="other">Other request</option>
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="details">Details</Label>
        <Textarea
          id="details"
          placeholder="Describe your request with any identifiers that help us locate your data."
          rows={7}
          aria-invalid={!!errors.details}
          aria-describedby={errors.details ? "details-error" : undefined}
          {...register("details")}
        />
        {errors.details?.message ? (
          <p id="details-error" className="text-sm text-destructive">
            {errors.details.message}
          </p>
        ) : null}
      </div>

      {status === "success" && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-sm text-foreground"
        >
          Request sent. We will acknowledge and respond per applicable laws.
        </div>
      )}
      {errors.root?.message && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {errors.root.message}
        </div>
      )}

      <Button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending..." : "Send request"}
      </Button>
    </form>
  );
};

export default DataRequestForm;
