"use server";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { cookies } from "next/headers";
import { authEmailReady, knownCodeLength, resendSignup, startReset, startSignup } from "@/lib/auth-email";
import { clientIp, humanCheck, isThrowawayEmail, limits } from "@/lib/guard";
import { clearVerify, rememberVerify } from "@/lib/verify-cookie";

// How many digits the emailed codes have. Usetally reads it from each code it
// sends; when Supabase sends its own email we can't see the code, so this
// falls back to AUTH_OTP_LENGTH (match Supabase → Auth → Email → OTP length), else 6.
const okLength = (n) => (Number(n) >= 6 && Number(n) <= 10 ? Number(n) : null);
let cookieLength = null; // read per request in remember()/fallbackLength()
const fallbackLength = () => okLength(process.env.AUTH_OTP_LENGTH) || cookieLength || knownCodeLength() || 6;
// keep the length in a cookie too, so a later screen (or another server) knows it
async function remember(n) {
  const store = await cookies();
  if (okLength(n)) { store.set("ut_code_len", String(n), { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/", httpOnly: true }); cookieLength = Number(n); }
  else cookieLength = okLength(store.get("ut_code_len")?.value);
}
const lengthFrom = (form) => okLength(form?.get?.("code_length")) || fallbackLength();

// only same-site paths may be used as a post-login destination
function safeNext(value, fallback = "/app") {
  const next = String(value || "");
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function signIn(_prev, form) {
  await remember();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!email || !password) return { error: "Enter your email and password.", email };
  // bots and password guessing: the hidden field, then limits per network and per email
  const human = await humanCheck(form, { minMs: 400, turnstile: false });
  if (!human.ok) return { error: human.error, email };
  const ip = await clientIp();
  const lim = await limits([
    ["login-ip", ip, 600, 30, "Too many sign-in attempts from your network. Wait 10 minutes and try again."],
    ["login-email", email, 600, 8, "Too many sign-in attempts for this email. Wait 10 minutes, or reset your password."],
  ]);
  if (!lim.ok) return { error: lim.error, email };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/confirm/i.test(error.message)) {
      // send a fresh code and let them finish verifying right here
      const next = safeNext(form.get("next"), "/onboarding");
      let codeLength = fallbackLength();
      if (await authEmailReady()) codeLength = (await resendSignup({ email, next }).catch(() => null))?.codeLength || codeLength;
      else await supabase.auth.resend({ type: "signup", email }).catch(() => {});
      await rememberVerify({ email, next, codeLength });
      return { verify: email, next, codeLength };
    }
    return { error: "That email and password don't match.", email };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev, form) {
  await remember();
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const next = safeNext(form.get("next"), "/onboarding");
  // React clears a form after each submit; sending name and email back keeps them filled in
  const keep = { name, email };
  // just email and password here; setup asks for the name next
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address.", ...keep };
  if (password.length < 8) return { error: "Use at least 8 characters for your password.", ...keep };
  const human = await humanCheck(form);
  if (!human.ok) return { error: human.error, ...keep };
  if (isThrowawayEmail(email)) return { error: "Use your real email address. Throwaway inboxes can't sign up.", ...keep };
  const ip = await clientIp();
  const lim = await limits([
    ["signup-ip", ip, 3600, 10, "Too many sign-ups from your network. Try again in an hour."],
    ["signup-ip-day", ip, 86400, 30, "Too many sign-ups from your network today. Try again tomorrow."],
  ]);
  if (!lim.ok) return { error: lim.error, ...keep };
  if (await authEmailReady()) {
    const r = await startSignup({ email, password, name, next });
    if (r.error) return { error: r.error, ...keep };
    await remember(r.codeLength);
    const codeLength = r.codeLength || fallbackLength();
    await rememberVerify({ email, next, codeLength });
    return { verify: email, next, codeLength };
  }
  // no email service set up: Supabase sends its own email
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: name }, emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: /registered/i.test(error.message) ? "An account with this email already exists. Sign in instead." : error.message, ...keep };
  if (data.session) redirect(next);
  await rememberVerify({ email, next, codeLength: fallbackLength() });
  return { verify: email, next, codeLength: fallbackLength() };
}

// the code from the sign-up email (we send it through Brevo; see lib/auth-email.js)
export async function verifySignup(_prev, form) {
  await remember();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const token = String(form.get("code") || "").replace(/\D/g, "");
  const next = safeNext(form.get("next"), "/onboarding");
  const codeLength = lengthFrom(form);
  if (!/^\d{6,10}$/.test(token)) return { verify: email, next, codeLength, error: "Enter the code from the email." };
  const lim = await limits([["verify-email", email, 600, 10, "Too many tries. Wait 10 minutes, or send a new code."]]);
  if (!lim.ok) return { verify: email, next, codeLength, errorTitle: "Code not accepted", error: lim.error };
  const supabase = await createSupabaseServer();
  let { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) ({ error } = await supabase.auth.verifyOtp({ email, token, type: "email" }));
  if (error) return { verify: email, next, codeLength, ...{ errorTitle: "Code not accepted", error: /rate|too many/i.test(error.message) ? "Too many tries. Wait a minute, then try again." : "That code is wrong or has expired. Check the latest email, or send a new code." } };
  await clearVerify();
  redirect(next);
}

// "Wrong email? Change it": forget the pending code and start again
export async function changeSignupEmail() {
  await clearVerify();
  redirect("/signup");
}

export async function resendSignupCode(email, next) {
  await remember();
  const address = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(address)) return { error: "Enter a valid email address." };
  const lim = await limits([["resend-ip", await clientIp(), 3600, 15, "Too many codes sent from your network. Try again later."]]);
  if (!lim.ok) return lim;
  if (await authEmailReady()) {
    const r = await resendSignup({ email: address, next: safeNext(next, "/onboarding") });
    return r.error ? r : { message: `A new code is on its way to ${address}.`, codeLength: r.codeLength || null };
  }
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.resend({ type: "signup", email: address });
  if (error) return { error: /seconds|rate/i.test(error.message) ? "Wait a minute before asking for another code." : "Could not send a new code. Try again shortly." };
  return { message: `A new code is on its way to ${address}.` };
}

export async function requestReset(_prev, form) {
  await remember();
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address.", email };
  const human = await humanCheck(form);
  if (!human.ok) return { error: human.error, email };
  return sendReset(email);
}

async function sendReset(email) {
  const lim = await limits([["reset-ip", await clientIp(), 3600, 10, "Too many reset requests from your network. Try again later."]]);
  if (!lim.ok) return { error: lim.error, email };
  let codeLength = fallbackLength();
  if (await authEmailReady()) {
    const r = await startReset({ email });
    if (r.error) return { error: r.error, email };
    await remember(r.codeLength);
    codeLength = r.codeLength || fallbackLength();
  } else {
    const supabase = await createSupabaseServer();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/reset` });
  }
  // same answer whether or not the account exists
  return { sent: email, codeLength };
}

// the code from the reset email signs them in, then they choose a password
export async function verifyResetCode(_prev, form) {
  await remember();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const token = String(form.get("code") || "").replace(/\D/g, "");
  const codeLength = lengthFrom(form);
  if (!/^\d{6,10}$/.test(token)) return { sent: email, codeLength, error: "Enter the code from the email." };
  const lim = await limits([["verify-reset", email, 600, 10, "Too many tries. Wait 10 minutes, or send a new code."]]);
  if (!lim.ok) return { sent: email, codeLength, errorTitle: "Code not accepted", error: lim.error };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
  if (error) return { sent: email, codeLength, ...{ errorTitle: "Code not accepted", error: /rate|too many/i.test(error.message) ? "Too many tries. Wait a minute, then try again." : "That code is wrong or has expired. Check the latest email, or send a new code." } };
  redirect("/reset");
}

export async function resendResetCode(email) {
  const address = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(address)) return { error: "Enter a valid email address." };
  const r = await sendReset(address);
  return r.error ? r : { message: `If an account exists for ${address}, a new code is on its way.`, codeLength: r.codeLength || null };
}

export async function updatePassword(_prev, form) {
  const password = String(form.get("password") || "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== String(form.get("confirm") || "")) return { error: "The two passwords don't match." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: /session|auth/i.test(error.message) ? "This reset has expired. Ask for a new code." : error.message };
  redirect("/app?password=updated");
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login?signed_out=1");
}

// "Continue with Google": Supabase sends the person to Google, then back to
// /auth/callback, which signs them in. New people land in onboarding (via /app).
export async function continueWithGoogle(next) {
  const supabase = await createSupabaseServer();
  const target = safeNext(next, "/app");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(target)}`, queryParams: { prompt: "select_account" } },
  });
  if (error || !data?.url) return { errorTitle: "Google sign-in isn't available", error: "Use your email and password for now, or try again shortly." };
  redirect(data.url);
}
