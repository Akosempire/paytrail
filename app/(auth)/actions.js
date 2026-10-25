"use server";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";
import { authEmailReady, resendSignup, startReset, startSignup } from "@/lib/auth-email";

// only same-site paths may be used as a post-login destination
function safeNext(value, fallback = "/app") {
  const next = String(value || "");
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function signIn(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!email || !password) return { error: "Enter your email and password.", email };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/confirm/i.test(error.message)) {
      // send a fresh code and let them finish verifying right here
      const next = safeNext(form.get("next"), "/onboarding");
      if (await authEmailReady()) await resendSignup({ email, next }).catch(() => {});
      else await supabase.auth.resend({ type: "signup", email }).catch(() => {});
      return { verify: email, next };
    }
    return { error: "That email and password don't match.", email };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev, form) {
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const next = safeNext(form.get("next"), "/onboarding");
  // React clears a form after each submit; sending name and email back keeps them filled in
  const keep = { name, email };
  if (!name) return { error: "Tell us your name.", ...keep };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address.", ...keep };
  if (password.length < 8) return { error: "Use at least 8 characters for your password.", ...keep };
  if (await authEmailReady()) {
    const r = await startSignup({ email, password, name, next });
    return r.error ? { error: r.error, ...keep } : { verify: email, next };
  }
  // no email service set up: Supabase sends its own email
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: name }, emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: /registered/i.test(error.message) ? "An account with this email already exists. Sign in instead." : error.message, ...keep };
  if (data.session) redirect(next);
  return { verify: email, next };
}

// the code from the sign-up email (we send it through Brevo; see lib/auth-email.js)
export async function verifySignup(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const token = String(form.get("code") || "").replace(/\D/g, "");
  const next = safeNext(form.get("next"), "/onboarding");
  if (!/^\d{6,10}$/.test(token)) return { verify: email, next, error: "Enter the code from the email." };
  const supabase = await createSupabaseServer();
  let { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
  if (error) ({ error } = await supabase.auth.verifyOtp({ email, token, type: "email" }));
  if (error) return { verify: email, next, ...{ errorTitle: "Code not accepted", error: /rate|too many/i.test(error.message) ? "Too many tries. Wait a minute, then try again." : "That code is wrong or has expired. Check the latest email, or send a new code." } };
  redirect(next);
}

export async function resendSignupCode(email, next) {
  const address = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(address)) return { error: "Enter a valid email address." };
  if (await authEmailReady()) {
    const r = await resendSignup({ email: address, next: safeNext(next, "/onboarding") });
    return r.error ? r : { message: `A new code is on its way to ${address}.` };
  }
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.resend({ type: "signup", email: address });
  if (error) return { error: /seconds|rate/i.test(error.message) ? "Wait a minute before asking for another code." : "Could not send a new code. Try again shortly." };
  return { message: `A new code is on its way to ${address}.` };
}

export async function requestReset(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address.", email };
  if (await authEmailReady()) {
    const r = await startReset({ email });
    if (r.error) return { error: r.error, email };
  } else {
    const supabase = await createSupabaseServer();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/reset` });
  }
  // same answer whether or not the account exists
  return { sent: email };
}

// the code from the reset email signs them in, then they choose a password
export async function verifyResetCode(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const token = String(form.get("code") || "").replace(/\D/g, "");
  if (!/^\d{6,10}$/.test(token)) return { sent: email, error: "Enter the code from the email." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
  if (error) return { sent: email, ...{ errorTitle: "Code not accepted", error: /rate|too many/i.test(error.message) ? "Too many tries. Wait a minute, then try again." : "That code is wrong or has expired. Check the latest email, or send a new code." } };
  redirect("/reset");
}

export async function resendResetCode(email) {
  const address = String(email || "").trim().toLowerCase();
  const fd = new FormData(); fd.set("email", address);
  const r = await requestReset(null, fd);
  return r.error ? r : { message: `If an account exists for ${address}, a new code is on its way.` };
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
