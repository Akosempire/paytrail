"use server";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/site";

// only same-site paths may be used as a post-login destination
function safeNext(value, fallback = "/app") {
  const next = String(value || "");
  return next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

export async function signIn(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  if (!email || !password) return { error: "Enter your email and password." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (/confirm/i.test(error.message)) return { error: "Confirm your email first. We sent you a link when you signed up." };
    return { error: "That email and password don't match." };
  }
  redirect(safeNext(form.get("next")));
}

export async function signUp(_prev, form) {
  const name = String(form.get("name") || "").trim();
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const next = safeNext(form.get("next"), "/onboarding");
  if (!name) return { error: "Tell us your name." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name: name }, emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: /registered/i.test(error.message) ? "An account with this email already exists. Sign in instead." : error.message };
  if (data.session) redirect(next);
  return { sent: email };
}

export async function requestReset(_prev, form) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!email) return { error: "Enter your email." };
  const supabase = await createSupabaseServer();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${siteUrl()}/auth/callback?next=/reset` });
  // same answer whether or not the account exists
  return { sent: email };
}

export async function updatePassword(_prev, form) {
  const password = String(form.get("password") || "");
  if (password.length < 8) return { error: "Use at least 8 characters." };
  if (password !== String(form.get("confirm") || "")) return { error: "The two passwords don't match." };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "This reset link has expired. Ask for a new one." };
  redirect("/app?password=updated");
}

export async function signOut() {
  const supabase = await createSupabaseServer();
  await supabase.auth.signOut();
  redirect("/login");
}
