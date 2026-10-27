"use client";
import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Eye, EyeOff, KeyRound, Lock, Mail, MailCheck } from "lucide-react";
import { Field, Input } from "@/components/ui";
import { FormMessage, SubmitButton, useActionToast } from "@/components/ui-client";
import { changeSignupEmail, continueWithGoogle, requestReset, resendResetCode, resendSignupCode, signIn, signUp, updatePassword, verifyResetCode, verifySignup } from "@/app/(auth)/actions";
import { BotFields } from "@/components/bot-fields";
import { BRAND } from "@/lib/brand";
import { OtpInput, ResendCode } from "@/components/otp-input";

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

// a button to the inbox for the big email providers (opens the app on phones)
function mailApp(email) {
  const d = String(email || "").split("@")[1]?.toLowerCase() || "";
  if (/^(gmail|googlemail)\.com$/.test(d)) return ["Open Gmail", "https://mail.google.com/mail/u/0/#inbox"];
  if (/^(outlook|hotmail|live|msn)\./.test(d)) return ["Open Outlook", "https://outlook.live.com/mail/0/inbox"];
  if (/^(yahoo|ymail)\./.test(d)) return ["Open Yahoo Mail", "https://mail.yahoo.com"];
  if (/^(icloud|me|mac)\.com$/.test(d)) return ["Open iCloud Mail", "https://www.icloud.com/mail"];
  return null;
}

// the code from the sign-up email (6–10 digits, whatever Supabase is set to)
export function VerifyEmailForm({ email, next, intro, codeLength = 6 }) {
  const [state, action] = useActionState(verifySignup, null);
  const [resend, setResend] = useState(null);
  useActionToast(resend);
  const form = useRef(null);
  const [code, setCode] = useState("");
  const length = state?.codeLength || resend?.codeLength || codeLength;
  return (
    <form ref={form} action={action} className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full border border-notice-line bg-notice text-intent-success"><MailCheck className="size-6" aria-hidden="true" /></span>
        <h1 className="text-title-1 text-ink">Check your email</h1>
        <p className="text-sm text-ink-2">{intro || `We sent a ${length}-digit code to`} <strong className="text-ink break-all">{email}</strong>. Enter it to confirm your email.</p>
      </div>
      <FormMessage state={state} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="next" value={next || ""} />
      <input type="hidden" name="code_length" value={length} />
      <OtpInput key={length} length={length} label="Confirmation code" errorKey={state?.error ? state : null} onChange={setCode} onComplete={() => form.current?.requestSubmit()} />
      <SubmitButton size="lg" block pendingText="Checking…" disabled={code.length < length}>Confirm email</SubmitButton>
      {mailApp(email) && (
        <a href={mailApp(email)[1]} target="_blank" rel="noopener noreferrer" className="-mt-2 inline-flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-semibold text-brand-ink ring-1 ring-line hover:bg-tray">
          {mailApp(email)[0]}<ExternalLink className="size-4" aria-hidden="true" />
        </a>
      )}
      <p className="text-center text-sm text-ink-2">
        No email? Check spam or Promotions, or{" "}
        <ResendCode onResend={async () => { const r = { messageTitle: "New code sent", ...(await resendSignupCode(email, next)) }; setResend(r); return r; }} label="send a new code" />
      </p>
      <p className="text-center text-xs text-ink-3">
        The email also has a button. Opening it works too. Wrong email?{" "}
        <button type="submit" formAction={changeSignupEmail} formNoValidate className="font-medium text-brand-ink underline-offset-2 hover:underline">Change it</button>
      </p>
    </form>
  );
}


// "Continue with Google", above the email form. Only rendered when Google is
// switched on in Supabase (see lib/auth-providers.js).
function GoogleSignIn({ next, label = "Continue with Google" }) {
  const [state, action] = useActionState(() => continueWithGoogle(next), null);
  return (
    <>
      <form action={action}>
        <FormMessage state={state} />
        <SubmitButton size="lg" block variant="secondary" pendingText="Opening Google…">
          <span className="inline-flex items-center gap-2.5">
            <svg aria-hidden="true" viewBox="0 0 48 48" className="size-[18px]"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            {label}
          </span>
        </SubmitButton>
      </form>
      <div className="flex items-center gap-3 text-xs text-ink-3" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
      </div>
    </>
  );
}

export function LoginForm({ next, google = false, token }) {
  const [state, action] = useActionState(signIn, null);
  if (state?.verify) return <VerifyEmailForm email={state.verify} next={state.next} codeLength={state.codeLength} intro={`Your email isn't confirmed yet. We sent a new ${state.codeLength || 6}-digit code to`} />;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-title-1 text-ink">Sign in to {BRAND.name}</h1>
        <p className="mt-1 text-sm text-ink-2">Welcome back. Pick up where you left off.</p>
      </div>
      {google && <GoogleSignIn next={next} />}
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next || ""} />
      <BotFields token={token} />
      <Field label="Email" htmlFor="email"><Input id="email" icon={Mail} name="email" type="email" defaultValue={state?.email ?? ""} placeholder="you@company.com" autoComplete="email" required /></Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" />
        <Link href="/forgot" className="self-end text-xs font-medium text-brand-ink hover:underline">Forgot password?</Link>
      </Field>
      <SubmitButton size="lg" block pendingText="Signing in…">Sign in</SubmitButton>
      <p className="text-center text-sm text-ink-2">New to {BRAND.name}? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-brand-ink hover:underline">Create an account</Link></p>
    </form>
    </div>
  );
}

export function SignupForm({ next, email, trialText, google = false, token, turnstile = false, pending }) {
  const [state, action] = useActionState(signUp, null);
  if (state?.verify) return <VerifyEmailForm email={state.verify} next={state.next} codeLength={state.codeLength} />;
  // came back from the email app (or the page reloaded): the code screen again
  if (pending && !state) return <VerifyEmailForm email={pending.email} next={pending.next} codeLength={pending.codeLength || 6} />;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-title-1 text-ink">Create your {BRAND.name} account</h1>
        <p className="mt-1 text-sm text-ink-2">{trialText || "Start free. No card needed."}</p>
      </div>
      {google && <GoogleSignIn next={next || "/onboarding"} label="Sign up with Google" />}
    <form action={action} className="flex flex-col gap-5">
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next || ""} />
      <BotFields token={token} turnstile={turnstile} resetKey={state} />
      <Field label="Email" htmlFor="email"><Input id="email" icon={Mail} name="email" type="email" defaultValue={state?.email ?? email ?? ""} placeholder="you@company.com" autoComplete="email" required /></Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters."><PasswordInput id="password" placeholder="Create a password" autoComplete="new-password" /></Field>
      <SubmitButton size="lg" block pendingText="Creating account…">Create account</SubmitButton>
      <p className="text-center text-xs text-ink-3">By creating an account you agree to the <Link href="/terms" target="_blank" className="underline underline-offset-2 hover:text-ink">Terms of Service</Link> and <Link href="/privacy" target="_blank" className="underline underline-offset-2 hover:text-ink">Privacy Policy</Link>.</p>
      <p className="text-center text-sm text-ink-2">Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-brand-ink hover:underline">Sign in</Link></p>
    </form>
    </div>
  );
}

export function ForgotForm({ token, turnstile = false }) {
  const [state, action] = useActionState(requestReset, null);
  if (state?.sent) return <ResetCodeForm email={state.sent} codeLength={state.codeLength} />;
  return (
    <form action={action} className="flex flex-col gap-5">
      <div>
        <h1 className="text-title-1 text-ink">Reset your password</h1>
        <p className="mt-1 text-sm text-ink-2">We'll email you a code to choose a new one.</p>
      </div>
      <FormMessage state={state} />
      <BotFields token={token} turnstile={turnstile} resetKey={state} />
      <Field label="Email" htmlFor="email"><Input id="email" icon={Mail} name="email" type="email" defaultValue={state?.email ?? ""} placeholder="you@company.com" autoComplete="email" required /></Field>
      <SubmitButton size="lg" block pendingText="Sending…">Send reset code</SubmitButton>
      <Link href="/login" className="text-center text-sm font-medium text-brand-ink hover:underline">Back to sign in</Link>
    </form>
  );
}

// step 2 of a reset: the code from the email
function ResetCodeForm({ email, codeLength = 6 }) {
  const [state, action] = useActionState(verifyResetCode, null);
  const [resend, setResend] = useState(null);
  useActionToast(resend);
  const form = useRef(null);
  const [code, setCode] = useState("");
  const length = state?.codeLength || resend?.codeLength || codeLength;
  return (
    <form ref={form} action={action} className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full border border-notice-line bg-notice text-intent-info"><KeyRound className="size-6" aria-hidden="true" /></span>
        <h1 className="text-title-1 text-ink">Check your email</h1>
        <p className="text-sm text-ink-2">If an account exists for <strong className="text-ink">{email}</strong>, we sent a {length}-digit code to reset your password.</p>
      </div>
      <FormMessage state={state} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="code_length" value={length} />
      <OtpInput key={length} length={length} label="Reset code" errorKey={state?.error ? state : null} onChange={setCode} onComplete={() => form.current?.requestSubmit()} />
      <SubmitButton size="lg" block pendingText="Checking…" disabled={code.length < length}>Continue</SubmitButton>
      <p className="text-center text-sm text-ink-2">
        No email? Check spam, or{" "}
        <ResendCode onResend={async () => { const r = { messageTitle: "New code sent", ...(await resendResetCode(email)) }; setResend(r); return r; }} label="send a new code" />
      </p>
      <Link href="/login" className="text-center text-sm font-medium text-brand-ink hover:underline">Back to sign in</Link>
    </form>
  );
}

export function ResetForm() {
  const [state, action] = useActionState(updatePassword, null);
  const [local, setLocal] = useState(null);
  // check the two passwords here, before sending: a server round trip would clear both boxes
  function check(e) {
    const f = new FormData(e.currentTarget);
    const pw = String(f.get("password") || "");
    const problem = pw.length < 8 ? "Use at least 8 characters." : pw !== String(f.get("confirm") || "") ? "The two passwords don't match." : null;
    if (problem) { e.preventDefault(); setLocal({ error: problem }); } else setLocal(null);
  }
  return (
    <form action={action} onSubmit={check} className="flex flex-col gap-5">
      <div>
        <h1 className="text-title-1 text-ink">Choose a new password</h1>
        <p className="mt-1 text-sm text-ink-2">You'll stay signed in after this.</p>
      </div>
      <FormMessage state={local || state} />
      <Field label="New password" htmlFor="password"><PasswordInput id="password" placeholder="At least 8 characters" autoComplete="new-password" /></Field>
      <Field label="Confirm password" htmlFor="confirm"><PasswordInput id="confirm" name="confirm" placeholder="Type it again" autoComplete="new-password" /></Field>
      <SubmitButton size="lg" block pendingText="Saving…">Save password</SubmitButton>
    </form>
  );
}
