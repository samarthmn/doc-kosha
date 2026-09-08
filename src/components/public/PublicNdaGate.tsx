import React, { useEffect, useRef, useState } from "react";
import { CircleNotch, PenNib, TextT } from "@phosphor-icons/react";
import NdaSignatureCanvas, {
  type NdaSignatureCanvasHandle,
} from "@/components/public/NdaSignatureCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type OtpStage = "input" | "code" | "verified";
export type NdaStep = "intro" | "verify" | "sign" | "processing";

export type OtpState = {
  email: string;
  stage: OtpStage;
  code: string;
  sending: boolean;
  verifying: boolean;
  error: string | null;
};

export const createInitialOtpState = (): OtpState => ({
  email: "",
  stage: "input",
  code: "",
  sending: false,
  verifying: false,
  error: null,
});

type OtpControls = {
  state: OtpState;
  resendCooldownSec: number;
  onEmailChange: (value: string) => void;
  onCodeChange: (value: string) => void;
  onSendCode: () => void;
  onVerifyCode: () => void;
  onChangeEmail: (options?: { clearEmail?: boolean }) => void;
};

type SignatureControls = {
  fullName: string;
  onFullNameChange: (value: string) => void;
  emailVerified: boolean;
  templateMissing: boolean;
  previewHtml: string | null;
  resolvedSignature: string | null;
  submitting: boolean;
  errorMessage: string | null;
  onSubmit: (signature: string | null) => void;
  signatureSource: "draw" | "typed" | null;
  onSignatureSourceChange: (source: "draw" | "typed") => void;
  onDrawSignatureChange: (value: string | null) => void;
  resetKey: number;
};

type CopyContext = {
  workspaceName?: string | null;
  resourcePlainName: string;
  resourceQuotedName: string;
  resourceActionVerb: string;
};

type PublicNdaGateProps = {
  step: NdaStep;
  introDescription: React.ReactNode;
  onContinueFromIntro: () => void;
  otpControls: OtpControls;
  signatureControls: SignatureControls;
  processingControls?: {
    message?: React.ReactNode;
    isChecking?: boolean;
    onCheck: () => void;
    onSignAgain?: () => void;
  };
  copy: CopyContext;
  messages: {
    processingTitle: string;
    processingMessage: string;
    retrying: string;
    signAgain: string;
    introTitle: string;
    verifyEmailTitle: string;
    verifyEmailDescription: string;
    sendVerificationCode: string;
    signTitle: string;
    signDescription: string;
    fullNameLabel: string;
    fullNamePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    verificationCodePlaceholder: string;
    emailVerified: string;
    agreementBetween: (
      workspaceName: string,
      fullName: string,
      resourcePlainName: string,
    ) => string;
    templateUnavailable: string;
    agreementPreview: string;
    reviewBeforeSigning: string;
    drawSignature: string;
    typeSignature: string;
    selected: string;
    drawSignatureHelp: string;
    clearSignature: string;
    typeSignaturePlaceholder: string;
    acceptAndSign: string;
    signing: string;
  };
  commonMessages: {
    changeEmail: string;
    sendCode: string;
    sending: string;
    verify: string;
    verifying: string;
    resendCode: string;
    resendIn: (seconds: number) => string;
    continue: string;
    change: string;
    tryAgain: string;
    didntGetCode: string;
  };
};

const renderShell = (
  children: React.ReactNode,
  maxWidthClass: string = "max-w-md",
) => (
  <div
    translate="no"
    data-ph-no-capture
    className="dk-public-recipient-shell ph-no-capture notranslate relative isolate flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background px-4 py-8 sm:px-6"
  >
    <div
      className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_50%_-10%,color-mix(in_srgb,var(--primary)_12%,transparent),transparent_42%)]"
      aria-hidden
    />
    <div
      className="pointer-events-none absolute inset-x-0 top-1/2 -z-10 h-px bg-gradient-to-r from-transparent via-border/70 to-transparent"
      aria-hidden
    />
    <div
      className={cn(
        "dk-nocturne-surface relative w-full space-y-6 overflow-hidden rounded-[14px] border border-border/70 bg-card/85 p-5 shadow-lg backdrop-blur-xl sm:p-7",
        maxWidthClass,
      )}
    >
      <div
        className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent"
        aria-hidden
      />
      {children}
    </div>
  </div>
);

const PublicNdaGate: React.FC<PublicNdaGateProps> = ({
  step,
  introDescription,
  onContinueFromIntro,
  otpControls,
  signatureControls,
  processingControls,
  copy,
  messages,
  commonMessages,
}) => {
  const {
    state: ndaOtp,
    resendCooldownSec,
    onEmailChange,
    onCodeChange,
    onSendCode,
    onVerifyCode,
    onChangeEmail,
  } = otpControls;

  const {
    fullName,
    onFullNameChange,
    emailVerified,
    templateMissing,
    previewHtml,
    resolvedSignature,
    submitting,
    errorMessage,
    onSubmit,
    signatureSource,
    onSignatureSourceChange,
    onDrawSignatureChange,
    resetKey,
  } = signatureControls;
  const signatureCanvasRef = useRef<NdaSignatureCanvasHandle | null>(null);
  const signatureSourceRef = useRef<"draw" | "typed" | null>(signatureSource);
  const lastResetKeyRef = useRef<number>(resetKey);
  const [drawHasInk, setDrawHasInk] = useState<boolean>(false);
  const isDrawSelected = signatureSource === "draw";
  const isTypedSelected = signatureSource === "typed";
  const canSubmitSelectedSignature = isDrawSelected
    ? drawHasInk
    : Boolean(resolvedSignature);

  useEffect(() => {
    signatureSourceRef.current = signatureSource;
  }, [signatureSource]);

  const selectSignatureSource = (source: "draw" | "typed") => {
    signatureSourceRef.current = source;
    onSignatureSourceChange(source);
  };

  useEffect(() => {
    if (lastResetKeyRef.current === resetKey) return;
    lastResetKeyRef.current = resetKey;
    signatureCanvasRef.current?.clear();
    setDrawHasInk(false);
  }, [resetKey]);

  const handleDrawSignatureCanvasChange = (value: string | null) => {
    setDrawHasInk(Boolean(value));
    onDrawSignatureChange(value);
  };

  const handleSubmitSignature = () => {
    const signature =
      signatureSourceRef.current === "draw"
        ? (signatureCanvasRef.current?.exportDataUrl() ?? null)
        : resolvedSignature;
    onSubmit(signature);
  };

  if (step === "processing") {
    return renderShell(
      <>
        <div className="space-y-3 text-center">
          <CircleNotch
            className="mx-auto h-8 w-8 animate-spin text-primary motion-reduce:animate-none"
            aria-hidden
          />
          <h1 className="text-xl font-medium tracking-[-0.02em]">
            {messages.processingTitle}
          </h1>
          <p className="mx-auto max-w-sm text-sm leading-6 text-muted-foreground">
            {processingControls?.message ?? messages.processingMessage}
          </p>
        </div>
        {errorMessage ? (
          <div className="space-y-3">
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
            >
              {errorMessage}
            </p>
            <div className="flex flex-col gap-2">
              {processingControls?.onCheck ? (
                <Button
                  type="button"
                  onClick={() => processingControls.onCheck()}
                  disabled={processingControls.isChecking}
                >
                  {processingControls.isChecking
                    ? messages.retrying
                    : commonMessages.tryAgain}
                </Button>
              ) : null}
              {processingControls?.onSignAgain ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => processingControls.onSignAgain?.()}
                  disabled={processingControls?.isChecking}
                >
                  {messages.signAgain}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </>,
      "max-w-md",
    );
  }

  if (step === "intro") {
    return renderShell(
      <>
        <div className="space-y-2.5 text-left">
          <div className="h-0.5 w-9 rounded-full bg-primary/75" aria-hidden />
          <h1 className="pt-1 text-xl font-medium tracking-[-0.02em]">
            {messages.introTitle}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {introDescription}
          </p>
        </div>
        <div>
          <Button
            type="button"
            className="w-full sm:w-auto"
            onClick={onContinueFromIntro}
          >
            {commonMessages.continue}
          </Button>
        </div>
      </>,
      "max-w-md",
    );
  }

  if (step === "verify") {
    return renderShell(
      <>
        <div className="space-y-2.5 text-left">
          <div className="h-0.5 w-9 rounded-full bg-primary/75" aria-hidden />
          <h1 className="pt-1 text-xl font-medium tracking-[-0.02em]">
            {messages.verifyEmailTitle}
          </h1>
          <p className="text-sm leading-6 text-muted-foreground">
            {messages.verifyEmailDescription}
          </p>
        </div>
        <div className="flex w-full flex-col gap-3">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              placeholder={messages.emailPlaceholder}
              type="email"
              aria-label={messages.emailLabel}
              spellCheck={false}
              autoComplete="email"
              value={ndaOtp.email}
              disabled={
                ndaOtp.stage !== "input" || ndaOtp.sending || ndaOtp.verifying
              }
              onChange={(e) => onEmailChange(e.target.value)}
            />
            {ndaOtp.stage !== "input" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onChangeEmail()}
                disabled={ndaOtp.sending || ndaOtp.verifying}
              >
                {commonMessages.changeEmail}
              </Button>
            )}
          </div>
          {ndaOtp.stage === "input" && (
            <Button
              type="button"
              onClick={() => void onSendCode()}
              disabled={!ndaOtp.email.trim() || ndaOtp.sending}
            >
              {ndaOtp.sending
                ? commonMessages.sending
                : commonMessages.sendCode}
            </Button>
          )}
        </div>
        {ndaOtp.stage === "code" && (
          <div className="flex flex-col gap-3">
            <Input
              placeholder={messages.verificationCodePlaceholder}
              inputMode="numeric"
              aria-label={messages.verificationCodePlaceholder}
              autoComplete="one-time-code"
              value={ndaOtp.code}
              disabled={ndaOtp.verifying}
              onChange={(e) => onCodeChange(e.target.value)}
            />
            <Button
              type="button"
              onClick={() => void onVerifyCode()}
              disabled={!ndaOtp.code.trim() || ndaOtp.verifying}
            >
              {ndaOtp.verifying
                ? commonMessages.verifying
                : commonMessages.verify}
            </Button>
            <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <span>{commonMessages.didntGetCode}</span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0"
                disabled={resendCooldownSec > 0 || ndaOtp.sending}
                onClick={() => void onSendCode()}
              >
                {resendCooldownSec > 0
                  ? commonMessages.resendIn(resendCooldownSec)
                  : commonMessages.resendCode}
              </Button>
            </div>
          </div>
        )}
        {(ndaOtp.error || errorMessage) && (
          <p
            role="alert"
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            {ndaOtp.error ?? errorMessage}
          </p>
        )}
      </>,
    );
  }

  return renderShell(
    <>
      <div className="space-y-2.5">
        <div className="h-0.5 w-9 rounded-full bg-primary/75" aria-hidden />
        <h1 className="text-2xl font-medium tracking-[-0.025em]">
          {messages.signTitle}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          {messages.signDescription}
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="nda-full-name">
            {messages.fullNameLabel}
          </label>
          <Input
            id="nda-full-name"
            placeholder={messages.fullNamePlaceholder}
            value={fullName}
            onChange={(e) => onFullNameChange(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="nda-email">
            {messages.emailLabel}
          </label>
          <div className="flex gap-2">
            <Input
              id="nda-email"
              placeholder={messages.emailPlaceholder}
              type="email"
              className="bg-background/50"
              spellCheck={false}
              autoComplete="email"
              value={ndaOtp.email}
              disabled={
                ndaOtp.stage !== "input" ||
                ndaOtp.sending ||
                ndaOtp.verifying ||
                emailVerified
              }
              onChange={(e) => onEmailChange(e.target.value)}
            />
            {(ndaOtp.stage !== "input" || emailVerified) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onChangeEmail({ clearEmail: !emailVerified })}
                disabled={ndaOtp.sending || ndaOtp.verifying}
              >
                {commonMessages.change}
              </Button>
            )}
          </div>
        </div>
      </div>
      {!emailVerified && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <Button
              type="button"
              className="w-full sm:w-auto"
              onClick={() => void onSendCode()}
              disabled={!ndaOtp.email.trim() || ndaOtp.sending}
            >
              {ndaOtp.sending
                ? commonMessages.sending
                : messages.sendVerificationCode}
            </Button>
          </div>
          {ndaOtp.stage === "code" && (
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <Input
                placeholder={messages.verificationCodePlaceholder}
                inputMode="numeric"
                value={ndaOtp.code}
                disabled={ndaOtp.verifying}
                onChange={(e) => onCodeChange(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onVerifyCode()}
                disabled={!ndaOtp.code.trim() || ndaOtp.verifying}
              >
                {ndaOtp.verifying
                  ? commonMessages.verifying
                  : commonMessages.verify}
              </Button>
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                disabled={resendCooldownSec > 0 || ndaOtp.sending}
                onClick={() => void onSendCode()}
              >
                {resendCooldownSec > 0
                  ? commonMessages.resendIn(resendCooldownSec)
                  : commonMessages.resendCode}
              </Button>
            </div>
          )}
        </div>
      )}
      {ndaOtp.error && !emailVerified && (
        <p
          role="alert"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
        >
          {ndaOtp.error}
        </p>
      )}
      {emailVerified && (
        <p
          role="status"
          className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm text-primary"
        >
          {messages.emailVerified}
        </p>
      )}
      {emailVerified && (
        <div className="space-y-6">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm leading-6 sm:p-5">
            <p>
              {messages.agreementBetween(
                copy.workspaceName || "the workspace",
                fullName || "...",
                copy.resourcePlainName,
              )}
            </p>
          </div>
          {templateMissing && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
            >
              {messages.templateUnavailable}
            </p>
          )}
          {previewHtml && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {messages.agreementPreview}
                </h2>
                <Badge variant="outline">{messages.reviewBeforeSigning}</Badge>
              </div>
              <div className="max-h-[360px] overflow-y-auto rounded-md border border-border/70 bg-white p-4 shadow-inner">
                <div
                  className="nda-preview-html"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              </div>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div
              role="group"
              aria-label={messages.drawSignature}
              className={cn(
                "relative cursor-pointer overflow-hidden rounded-lg border bg-card/35 p-4 transition-colors motion-reduce:transition-none sm:p-5",
                isDrawSelected
                  ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40"
                  : "border-border/70 hover:border-primary/30",
              )}
              onClick={() => selectSignatureSource("draw")}
            >
              <div className="space-y-3">
                <div className="flex h-6 items-center justify-between">
                  <Button
                    type="button"
                    variant={isDrawSelected ? "default" : "outline"}
                    size="sm"
                    className="h-8 gap-2"
                    aria-pressed={isDrawSelected}
                    onClick={() => selectSignatureSource("draw")}
                  >
                    <PenNib className="h-4 w-4" aria-hidden />
                    {messages.drawSignature}
                  </Button>
                  {isDrawSelected && (
                    <Badge
                      variant="default"
                      className="border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {messages.selected}
                    </Badge>
                  )}
                </div>
                <NdaSignatureCanvas
                  ref={signatureCanvasRef}
                  ariaLabel={messages.drawSignature}
                  className="rounded-md border border-border/70 bg-background/50"
                  clearLabel={messages.clearSignature}
                  onBegin={() => selectSignatureSource("draw")}
                  onChange={handleDrawSignatureCanvasChange}
                />
                <p className="text-xs text-muted-foreground">
                  {messages.drawSignatureHelp}
                </p>
              </div>
            </div>
            <div
              role="group"
              aria-label={messages.typeSignature}
              className={cn(
                "relative cursor-pointer overflow-hidden rounded-lg border bg-card/35 p-4 transition-colors motion-reduce:transition-none sm:p-5",
                isTypedSelected
                  ? "border-primary/60 bg-primary/5 ring-1 ring-primary/40"
                  : "border-border/70 hover:border-primary/30",
              )}
              onClick={() => selectSignatureSource("typed")}
            >
              <div className="space-y-3">
                <div className="flex h-6 items-center justify-between">
                  <Button
                    type="button"
                    variant={isTypedSelected ? "default" : "outline"}
                    size="sm"
                    className="h-8 gap-2"
                    aria-pressed={isTypedSelected}
                    onClick={() => selectSignatureSource("typed")}
                  >
                    <TextT className="h-4 w-4" aria-hidden />
                    {messages.typeSignature}
                  </Button>
                  {isTypedSelected && (
                    <Badge
                      variant="default"
                      className="border-primary bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      {messages.selected}
                    </Badge>
                  )}
                </div>
                <div
                  className="flex h-28 items-center justify-center overflow-hidden rounded-md border border-border/70 bg-background/50 p-4 text-3xl font-semibold italic"
                  style={{
                    fontFamily:
                      "'Brush Script MT', 'Segoe Script', 'Pacifico', cursive",
                  }}
                >
                  {fullName.trim()
                    ? fullName.trim()
                    : messages.typeSignaturePlaceholder}
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-3 border-t border-border/70 pt-5">
            <Button
              type="button"
              size="lg"
              className="w-full min-w-[200px] sm:w-auto"
              disabled={
                submitting ||
                !canSubmitSelectedSignature ||
                !fullName.trim() ||
                templateMissing
              }
              onClick={handleSubmitSignature}
            >
              {submitting ? messages.signing : messages.acceptAndSign}
            </Button>
            {errorMessage && (
              <p
                role="alert"
                className="w-full rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
              >
                {errorMessage}
              </p>
            )}
          </div>
        </div>
      )}
    </>,
    "max-w-5xl",
  );
};

export default PublicNdaGate;
