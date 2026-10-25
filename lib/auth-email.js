import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseService } from "@/lib/supabase/server";
import { emailConfigured, sendEmail } from "@/lib/email";
import { resetCodeEmail, signupCodeEmail } from "@/lib/emails";
import { siteUrl } from "@/lib/site";

// Sign-up codes and password resets, delivered by us through Brevo.
//
// Supabase's admin generateLink() creates the code (email_otp) and the link
// token (hashed_token) WITHOUT sending anything, so Supabase's own plain
// emails never go out. We send our designed email instead. Verifying is still
// done by Supabase (verifyOtp), so sessions and security are unchanged.
//
// If SMTP isn't set up, the callers fall back to Supabase's built-in emails.

export const authEmailReady = async () => Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && (await emailConfigured());

const hash = (email) => createHash("sha256").update(`auth-email:${email}`).digest("hex");
const callback = (tokenHash, type, next) =>
  `${siteUrl()}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(type)}&next=${encodeURIComponent(next)}`;

// at most one email every 45 seconds and 5 every 15 minutes, per address and kind
async function allow(service, email, kind) {
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data, error } = await service.from("email_sends").select("created_at").eq("email_hash", hash(email)).eq("kind", kind).gt("created_at", since).order("created_at", { ascending: false });
  if (error) return { ok: true }; // table not created yet: don't block sign-ups
  if (data.length >= 5) return { ok: false, error: "Too many emails sent to this address. Wait 15 minutes and try again." };
  if (data[0] && Date.now() - new Date(data[0].created_at).getTime() < 45_000) return { ok: false, error: "We just sent an email. Wait a minute before asking for another." };
  await service.from("email_sends").insert({ email_hash: hash(email), kind });
  if (Math.random() < 0.05) await service.from("email_sends").delete().lt("created_at", new Date(Date.now() - 86_400_000).toISOString());
  return { ok: true };
}

async function status(service, email) {
  const { data } = await service.rpc("auth_email_status", { target_email: email });
  return data?.[0] || null;
}

// New account: creates the (unconfirmed) user and emails the code.
export async function startSignup({ email, password, name, next }) {
  const service = createSupabaseService();
  // an existing, confirmed account: say so straight away (and send nothing)
  const before = await status(service, email);
  if (before?.confirmed) return { error: "An account with this email already exists. Sign in instead." };
  const gate = await allow(service, email, "signup");
  if (!gate.ok) return { error: gate.error };
  let { data, error } = await service.auth.admin.generateLink({ type: "signup", email, password, options: { data: { full_name: name } } });
  if (error) {
    if (/password/i.test(error.message)) return { error: error.message };
    const existing = await status(service, email);
    if (existing?.confirmed) return { error: "An account with this email already exists. Sign in instead." };
    if (!existing) return { error: "We couldn't create your account. Try again shortly." };
    // signed up before but never confirmed: keep their latest details, send a fresh code
    await service.auth.admin.updateUserById(existing.user_id, { password, user_metadata: { full_name: name } });
    ({ data, error } = await service.auth.admin.generateLink({ type: "magiclink", email }));
    if (error) return { error: "We couldn't send your code. Try again shortly." };
  }
  return deliverSignup(data, { name, next });
}

// "Send a new code", or signing in before confirming. Only unconfirmed
// accounts get a code; everyone else gets the same reply, so this can't be
// used to find out who has an account.
export async function resendSignup({ email, next }) {
  const service = createSupabaseService();
  const existing = await status(service, email);
  if (!existing || existing.confirmed) return { sent: true };
  const gate = await allow(service, email, "signup");
  if (!gate.ok) return { error: gate.error };
  const { data, error } = await service.auth.admin.generateLink({ type: "magiclink", email });
  if (error) return { error: "We couldn't send a new code. Try again shortly." };
  return deliverSignup(data, { name: data.user?.user_metadata?.full_name, next });
}

async function deliverSignup(data, { name, next }) {
  const props = data?.properties || {};
  const link = props.hashed_token ? callback(props.hashed_token, props.verification_type || "signup", next || "/onboarding") : null;
  const mail = await sendEmail({ to: data.user.email, ...signupCodeEmail({ name: name || data.user?.user_metadata?.full_name, code: props.email_otp, link }) });
  return mail.sent ? { sent: true } : { error: "We couldn't send the email. Try again shortly." };
}

// Password reset: emails a code and a link. Same reply whether or not the
// account exists.
export async function startReset({ email }) {
  const service = createSupabaseService();
  const existing = await status(service, email);
  if (!existing) return { sent: true };
  const gate = await allow(service, email, "reset");
  if (!gate.ok) return { error: gate.error };
  const { data, error } = await service.auth.admin.generateLink({ type: "recovery", email });
  if (error) return { error: "We couldn't send the reset email. Try again shortly." };
  const props = data.properties || {};
  const mail = await sendEmail({ to: email, ...resetCodeEmail({ code: props.email_otp, link: props.hashed_token ? callback(props.hashed_token, "recovery", "/reset") : null }) });
  return mail.sent ? { sent: true } : { error: "We couldn't send the reset email. Try again shortly." };
}
