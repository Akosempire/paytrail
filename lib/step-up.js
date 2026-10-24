import "server-only";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { createSupabaseService } from "@/lib/supabase/server";
import { brandedEmail, emailConfigured, sendEmail } from "@/lib/email";

// Step-up verification: before someone changes payment keys or bank
// details, we email a 6-digit code to their own address. A correct code
// opens a 10-minute window for that business and purpose.
// Without email set up (SMTP_* not configured) codes can't be delivered, so
// the window is granted directly; set up Brevo to turn the protection on.

export const PURPOSES = {
  payment_keys: "change payment keys",
  bank_details: "change bank details",
};
const CODE_MINUTES = 10;
const WINDOW_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const hashCode = (code, userId, purpose) =>
  createHash("sha256").update(`${code}:${userId}:${purpose}:${process.env.APP_ENCRYPTION_KEY || ""}`).digest("hex");

export function maskEmail(email = "") {
  const [name, domain] = String(email).split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export async function hasStepUp(ctx, purpose, businessId) {
  const service = createSupabaseService();
  let q = service.from("security_codes").select("id").eq("user_id", ctx.user.id).eq("purpose", purpose)
    .gt("verified_until", new Date().toISOString()).limit(1);
  q = businessId ? q.eq("business_id", businessId) : q.is("business_id", null);
  const { data } = await q;
  return Boolean(data?.length);
}

async function grant(ctx, purpose, businessId) {
  const now = Date.now();
  await createSupabaseService().from("security_codes").insert({
    user_id: ctx.user.id, business_id: businessId || null, purpose, code_hash: "granted-without-email",
    expires_at: new Date(now).toISOString(), used_at: new Date(now).toISOString(),
    verified_until: new Date(now + WINDOW_MINUTES * 60_000).toISOString(),
  });
}

// returns null when the person may go ahead, or { stepUp, email } when a code is needed
export async function requireStepUp(ctx, purpose, businessId) {
  if (await hasStepUp(ctx, purpose, businessId)) return null;
  if (!emailConfigured()) { await grant(ctx, purpose, businessId); return null; }
  return { stepUp: purpose, email: maskEmail(ctx.user.email) };
}

export async function sendStepUpCode(ctx, purpose, businessId, businessName) {
  if (!PURPOSES[purpose]) return { error: "Unknown action." };
  if (!emailConfigured()) { await grant(ctx, purpose, businessId); return { granted: true }; }
  const service = createSupabaseService();
  const since = new Date(Date.now() - 15 * 60_000).toISOString();
  const { data: recent } = await service.from("security_codes").select("created_at").eq("user_id", ctx.user.id).gt("created_at", since).order("created_at", { ascending: false });
  if ((recent || []).length >= 5) return { error: "Too many codes requested. Wait 15 minutes and try again." };
  if (recent?.[0] && Date.now() - new Date(recent[0].created_at).getTime() < 45_000) return { error: "A code was just sent. Wait a moment before asking for another." };
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await service.from("security_codes").insert({
    user_id: ctx.user.id, business_id: businessId || null, purpose, code_hash: hashCode(code, ctx.user.id, purpose),
    expires_at: new Date(Date.now() + CODE_MINUTES * 60_000).toISOString(),
  });
  if (error) return { error: "Could not create a code. Try again." };
  const mail = await sendEmail({
    to: ctx.user.email,
    subject: `${code} is your PayTrail security code`,
    html: brandedEmail({
      brandName: "PayTrail",
      heading: `Your code: ${code.slice(0, 3)} ${code.slice(3)}`,
      lines: [
        `Use this code to ${PURPOSES[purpose]}${businessName ? ` for ${businessName}` : ""}. It expires in ${CODE_MINUTES} minutes.`,
        "If you didn't try to do this, don't share the code. Change your password, because someone may be using your account.",
      ],
      footer: "PayTrail security. We never ask for this code by phone or chat.",
    }),
  });
  if (!mail.sent) return { error: "We couldn't send the email. Try again shortly." };
  return { sent: true, email: maskEmail(ctx.user.email) };
}

export async function verifyStepUpCode(ctx, purpose, businessId, code) {
  const clean = String(code || "").replace(/\D/g, "");
  if (clean.length !== 6) return { error: "Enter the 6-digit code from the email." };
  const service = createSupabaseService();
  let q = service.from("security_codes").select("*").eq("user_id", ctx.user.id).eq("purpose", purpose).is("used_at", null)
    .gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1);
  q = businessId ? q.eq("business_id", businessId) : q.is("business_id", null);
  const { data } = await q;
  const row = data?.[0];
  if (!row) return { error: "That code has expired. Ask for a new one." };
  if (row.attempts >= MAX_ATTEMPTS) return { error: "Too many wrong tries. Ask for a new code." };
  const expected = Buffer.from(row.code_hash, "hex");
  const given = Buffer.from(hashCode(clean, ctx.user.id, purpose), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    await service.from("security_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return { error: row.attempts + 1 >= MAX_ATTEMPTS ? "Too many wrong tries. Ask for a new code." : "That code isn't right. Check the email and try again." };
  }
  const now = Date.now();
  await service.from("security_codes").update({ used_at: new Date(now).toISOString(), verified_until: new Date(now + WINDOW_MINUTES * 60_000).toISOString() }).eq("id", row.id);
  return { verified: true };
}
