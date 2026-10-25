"use client";
import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Eye, EyeOff, KeyRound, Lock, Mail, MailCheck, User } from "lucide-react";
import { Alert, Callout, Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton } from "@/components/ui-client";
import { requestReset, resendResetCode, resendSignupCode, signIn, signUp, updatePassword, verifyResetCode, verifySignup } from "@/app/(auth)/actions";
import { BRAND } from "@/lib/brand";

function PasswordInput({ name = "password", placeholder = "Enter your password", autoComplete = "current-password", id }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input id={id} icon={Lock} name={name} type={show ? "text" : "password"} placeholder={placeholder} autoComplete={autoComplete} required minLength={8} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}
        className="absolute top-1/2 right-3 -translate-y-1/2 text-ink-3 hover:text-ink">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

// 6-digit code from the sign-up email
export function VerifyEmailForm({ email, next, intro }) {
  const [state, action] = useActionState(verifySignup, null);
  const [resend, setResend] = useState(null);
  const [sending, start] = useTransition();
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full border border-notice-line bg-notice text-intent-success"><MailCheck className="size-6" aria-hidden="true" /></span>
        <h1 className="text-title-1 text-ink">Check your email</h1>
        <p className="text-sm text-ink-2">{intro || "We sent a 6-digit code to"} <strong className="text-ink">{email}</strong>. Enter it to confirm your email.</p>
      </div>
      <FormMessage state={state} />
      {resend?.message && <Alert intent="success" size="sm" title="New code sent">{resend.message}</Alert>}
      {resend?.error && <Alert intent="error" size="sm">{resend.error}</Alert>}
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next || ""} />
      <Field label="Confirmation code" htmlFor="code">
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required autoFocus maxLength={12} className={CODE_INPUT} />
      </Field>
      <SubmitButton size="lg" block pendingText="Checking…">Confirm email</SubmitButton>
      <p className="text-center text-sm text-ink-2">
        No email? Check spam, or{" "}
        <button type="button" disabled={sending} onClick={() => start(async () => setResend(await resendSignupCode(email, next)))} className="font-medium text-brand-ink hover:underline disabled:opacity-50">send a new code</button>.
      </p>
      <p className="text-center text-xs text-ink-3">The email also has a button. Opening it works too.</p>
    </form>
  );
}

export function LoginForm({ next, notice }) {
  const [state, action] = useActionState(signIn, null);
  if (state?.verify) return <VerifyEmailForm email={state.verify} next={state.next} intro="Your email isn't confirmed yet. We sent a new 6-digit code to" />;
  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <h1 className="text-title-1 text-ink">Sign in to {BRAND.name}</h1>
        <p className="mt-1 text-sm text-ink-2">Welcome back. Pick up where you left off.</p>
      </div>
      {notice && <Callout tone="info">{notice}</Callout>}
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next || ""} />
      <Field label="Email" htmlFor="email"><Input id="email" icon={Mail} name="email" type="email" placeholder="you@company.com" autoComplete="email" required /></Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" />
        <Link href="/forgot" className="self-end text-xs font-medium text-brand-ink hover:underline">Forgot password?</Link>
      </Field>
      <SubmitButton size="lg" block pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-sm text-ink-2">New to {BRAND.name}? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-brand-ink hover:underline">Create an account</Link></p>
    </form>
  );
}

export function SignupForm({ next, email, trialText }) {
  const [state, action] = useActionState(signUp, null);
  if (state?.verify) return <VerifyEmailForm email={state.verify} next={state.next} />;
  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <h1 className="text-title-1 text-ink">Create your {BRAND.name} account</h1>
        <p className="mt-1 text-sm text-ink-2">{trialText || "Start free. No card needed."}</p>
      </div>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next || ""} />
      <Field label="Your full name" htmlFor="name"><Input id="name" icon={User} name="name" placeholder="Tolu Adeyemi" autoComplete="name" required /></Field>
      <Field label="Work email" htmlFor="email"><Input id="email" icon={Mail} name="email" type="email" defaultValue={email || ""} placeholder="you@company.com" autoComplete="email" required /></Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters."><PasswordInput id="password" placeholder="Create a password" autoComplete="new-password" /></Field>
      <SubmitButton size="lg" block pendingText="Creating account…">Create account</SubmitButton>
      <p className="text-center text-xs text-ink-3">By creating an account you agree to the <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-ink">Terms of Service</Link> and <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-ink">Privacy Policy</Link>.</p>
      <p className="text-center text-sm text-ink-2">Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-brand-ink hover:underline">Sign in</Link></p>
    </form>
  );
}

const CODE_INPUT = "h-14 w-full rounded-lg bg-surface text-center font-mono text-[26px] tracking-[0.3em] text-ink ring-1 ring-inset ring-line-strong focus:ring-2 focus:ring-brand focus:outline-none";

export function ForgotForm() {
  const [state, action] = useActionState(requestReset, null);
  if (state?.sent) return <ResetCodeForm email={state.sent} />;
  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <h1 className="text-title-1 text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-2">We'll email you a code to choose a new one.</p>
      </div>
      <FormMessage state={state} />
      <Field label="Email" htmlFor="email"><Input id="email" icon={Mail} name="email" type="email" placeholder="you@company.com" autoComplete="email" required /></Field>
      <SubmitButton size="lg" block pendingText="Sending…">Send reset code</SubmitButton>
      <Link href="/login" className="text-center text-sm font-medium text-brand-ink hover:underline">Back to sign in</Link>
    </form>
  );
}

// step 2 of a reset: the code from the email
function ResetCodeForm({ email }) {
  const [state, action] = useActionState(verifyResetCode, null);
  const [resend, setResend] = useState(null);
  const [sending, start] = useTransition();
  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full border border-notice-line bg-notice text-intent-info"><KeyRound className="size-6" aria-hidden="true" /></span>
        <h1 className="text-title-1 text-ink">Check your email</h1>
        <p className="text-sm text-ink-2">If an account exists for <strong className="text-ink">{email}</strong>, we sent a code to reset your password.</p>
      </div>
      <FormMessage state={state} />
      {resend?.message && <Alert intent="success" size="sm" title="New code sent">{resend.message}</Alert>}
      {resend?.error && <Alert intent="error" size="sm">{resend.error}</Alert>}
      <input type="hidden" name="email" value={email} />
      <Field label="Reset code" htmlFor="code">
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required autoFocus maxLength={12} className={CODE_INPUT} />
      </Field>
      <SubmitButton size="lg" block pendingText="Checking…">Continue</SubmitButton>
      <p className="text-center text-sm text-ink-2">
        No email? Check spam, or{" "}
        <button type="button" disabled={sending} onClick={() => start(async () => setResend(await resendResetCode(email)))} className="font-medium text-brand-ink hover:underline disabled:opacity-50">send a new code</button>.
      </p>
      <Link href="/login" className="text-center text-sm font-medium text-brand-ink hover:underline">Back to sign in</Link>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <h1 className="text-title-1 text-ink">Choose a new password</h1>
        <p className="mt-1 text-sm text-ink-2">You'll stay signed in after this.</p>
      </div>
      <FormMessage state={state} />
      <Field label="New password" htmlFor="password"><PasswordInput id="password" placeholder="At least 8 characters" autoComplete="new-password" /></Field>
      <Field label="Confirm password" htmlFor="confirm"><PasswordInput id="confirm" name="confirm" placeholder="Type it again" autoComplete="new-password" /></Field>
      <SubmitButton size="lg" block pendingText="Saving…">Save password</SubmitButton>
    </form>
  );
}
