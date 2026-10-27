"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { decryptSecret, encryptSecret, hint } from "@/lib/crypto";
import { toMinor, CURRENCIES } from "@/lib/money";
import { KEY_RULES, webhookSecretProblem } from "@/lib/payments/keys";
import { requireStepUp } from "@/lib/step-up";
import { notifyAdmins } from "@/lib/admin-alerts";

export async function savePlan(id, form) {
  const ctx = await requirePlatformAdmin();
  const price = toMinor(form.price);
  const intOrNull = (v) => (String(v ?? "").trim() === "" ? null : Math.max(0, parseInt(v, 10)));
  const row = {
    name: String(form.name || "").trim().slice(0, 60),
    tagline: String(form.tagline || "").trim().slice(0, 140),
    price_minor: price,
    currency: CURRENCIES.includes(form.currency) ? form.currency : "NGN",
    billing_interval: form.billing_interval === "year" ? "year" : "month",
    document_limit: intOrNull(form.document_limit),
    seat_limit: intOrNull(form.seat_limit) || null,
    allow_company: Boolean(form.allow_company),
    features: String(form.features || "").split("\n").map((f) => f.trim()).filter(Boolean).slice(0, 12),
    active: Boolean(form.active),
    sort_order: parseInt(form.sort_order || 0, 10) || 0,
    tax_filing_fee_minor: String(form.filing_fee ?? "").trim() === "" ? null : toMinor(form.filing_fee),
    spots: intOrNull(form.spots),
    updated_at: new Date().toISOString(),
  };
  if (row.tax_filing_fee_minor != null && !Number.isFinite(row.tax_filing_fee_minor)) return { error: "Check the “File & pay for me” price." };
  if (!row.name) return { error: "Give the plan a name." };
  if (!Number.isFinite(price)) return { error: "Check the price." };
  const { error } = id ? await ctx.supabase.from("plans").update(row).eq("id", id) : await ctx.supabase.from("plans").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/admin/plans");
  return { message: id ? "Plan updated. Existing subscribers keep their current period." : "Plan created." };
}

export async function saveTrial(form) {
  const ctx = await requirePlatformAdmin();
  const row = {
    trial_mode: ["documents", "days", "none"].includes(form.trial_mode) ? form.trial_mode : "documents",
    trial_documents: Math.max(0, parseInt(form.trial_documents, 10) || 0),
    trial_days: Math.max(0, parseInt(form.trial_days, 10) || 0),
    support_email: String(form.support_email || "").trim().slice(0, 200),
    updated_at: new Date().toISOString(),
  };
  const { error } = await ctx.supabase.from("platform_settings").update(row).eq("id", true);
  if (error) return { error: error.message };
  revalidatePath("/admin", "layout");
  return { message: "Trial settings saved. They apply to new sign-ups and current trials." };
}

export async function saveBilling(form) {
  const ctx = await requirePlatformAdmin();
  const provider = ["manual", ...Object.keys(KEY_RULES)].includes(form.provider) ? form.provider : "manual";
  const rule = KEY_RULES[provider];
  const update = { billing_provider: provider, updated_at: new Date().toISOString() };
  const key = String(form.secretKey || "").trim();
  const hook = String(form.webhookSecret || "").trim();
  if (key || hook) {
    const gate = await requireStepUp(ctx, "payment_keys", null);
    if (gate) return gate;
  }
  if (provider !== "manual" && key) {
    if (!rule.valid(key)) return { error: rule.badKey };
    const check = await rule.check(key);
    if (!check.ok) return { error: check.error };
    update.billing_secret_enc = encryptSecret(key);
    update.billing_key_hint = hint(key);
    if (!rule.needsWebhookSecret) update.billing_webhook_secret_enc = update.billing_secret_enc;
  }
  if (provider !== "manual" && hook && rule.needsWebhookSecret) {
    const problem = webhookSecretProblem(provider, hook);
    if (problem) return { error: problem };
    update.billing_webhook_secret_enc = encryptSecret(hook);
  }
  const service = createSupabaseService();
  const { data: current } = await service.from("platform_settings").select("billing_provider, billing_secret_enc, billing_webhook_secret_enc").eq("id", true).single();
  // keys belong to one provider: switching provider needs that provider's own keys
  if (provider !== "manual" && provider !== current?.billing_provider && !update.billing_secret_enc) return { error: "Paste the secret key for Usetally's own account with this provider." };
  if (provider !== "manual" && provider !== current?.billing_provider && rule.needsWebhookSecret && !hook) return { error: "Paste the webhook secret for this provider." };
  if (provider !== "manual" && !update.billing_secret_enc && !current?.billing_secret_enc) return { error: "Paste the secret key for Usetally's own account." };
  if (provider !== "manual" && !update.billing_webhook_secret_enc && !current?.billing_webhook_secret_enc) return { error: "Paste the webhook secret." };
  const { error } = await service.from("platform_settings").update(update).eq("id", true);
  if (error) return { error: error.message };
  if (key || hook) await notifyAdmins({ subject: `Usetally billing keys changed (${provider})`, lines: [`${ctx.user.email} changed Usetally's own ${provider} billing keys at ${new Date().toUTCString()}.`, "If this wasn't you, sign in and replace the keys with your provider straight away."], link: "/admin/integrations" });
  revalidatePath("/admin", "layout");
  return { message: "Billing settings saved." };
}

export async function updateBusinessAccount(businessId, form) {
  const ctx = await requirePlatformAdmin();
  const action = form.action;
  if (action === "extend") {
    if (!form.plan_id) return { error: "Choose a plan." };
    const amount = String(form.amount ?? "").trim() === "" ? null : toMinor(form.amount);
    const { error } = await ctx.supabase.rpc("admin_extend_subscription", { target: businessId, new_plan: form.plan_id, pay_reference: String(form.reference || "").slice(0, 120), pay_amount: amount });
    if (error) return { error: error.message };
  } else if (action === "status") {
    if (!["trialing", "active", "past_due", "canceled", "suspended"].includes(form.status)) return { error: "Unknown status." };
    const { error } = await ctx.supabase.from("businesses").update({ subscription_status: form.status }).eq("id", businessId);
    if (error) return { error: error.message };
  } else if (action === "trial") {
    const extra = Math.max(0, parseInt(form.extra_documents || 0, 10) || 0);
    const days = Math.max(0, parseInt(form.extra_days || 0, 10) || 0);
    const { data: b } = await ctx.supabase.from("businesses").select("trial_documents_used, trial_ends_at").eq("id", businessId).single();
    const base = b.trial_ends_at && new Date(b.trial_ends_at) > new Date() ? new Date(b.trial_ends_at) : new Date();
    const { error } = await ctx.supabase.from("businesses").update({
      subscription_status: "trialing",
      trial_documents_used: Math.max(0, b.trial_documents_used - extra),
      trial_ends_at: days ? new Date(base.getTime() + days * 86400000).toISOString() : b.trial_ends_at,
    }).eq("id", businessId);
    if (error) return { error: error.message };
  } else return { error: "Unknown action." };
  revalidatePath("/admin/businesses");
  return { message: "Account updated." };
}

// Brevo for all of Usetally's email, set up here instead of in Vercel.
// The first setup needs no security code (email can't deliver one yet);
// changing a working setup does, because whoever controls this key can read
// every sign-up and reset code.
export async function saveEmailSettings(form) {
  const ctx = await requirePlatformAdmin();
  // never crash the card: show the admin what went wrong instead
  try { return await saveEmailSettingsInner(ctx, form); }
  catch (e) { console.error("email_settings.save_failed", { message: e?.message }); return { error: serverProblem(e) }; }
}

function serverProblem(e) {
  const m = String(e?.message || e || "");
  if (/APP_ENCRYPTION_KEY/.test(m)) return "APP_ENCRYPTION_KEY is missing in Vercel, so the key can't be stored safely. In Vercel → Settings → Environment Variables, add APP_ENCRYPTION_KEY with any long random text (at least 32 characters), redeploy, then try again. Keep that value: changing it later means re-entering saved keys.";
  if (/SUPABASE_SERVICE_ROLE_KEY/.test(m)) return "SUPABASE_SERVICE_ROLE_KEY is missing in Vercel. Copy it from Supabase → Project Settings → API (service_role), add it in Vercel, redeploy, then try again.";
  if (/column|email_api_key_enc|schema cache/i.test(m)) return "The database is missing the new email columns. Run supabase/RUN_NEW_2026-10-25b.sql in Supabase → SQL Editor, then try again.";
  return `Something went wrong on the server: ${m.slice(0, 240) || "no details"}`;
}

async function saveEmailSettingsInner(ctx, form) {
  const { checkBrevo, checkBrevoSmtp, checkSendhiiv, checkSendbyte, forgetEmailConfig } = await import("@/lib/email");
  const smtpLogin = String(form.smtpLogin || "").trim().toLowerCase();
  // works with either kind of Brevo key: an API key (xkeysib-) or an SMTP key (xsmtpsib-) plus its login
  // the key's prefix says which service it belongs to
  const verify = (secret, address) => !/^(sh_|sk_|xkeysib-|[^\n]*\n)/.test(secret)
    ? { ok: false, error: "That doesn't look like a Sendbyte key (starts sk_live_), a Sendhiiv key (starts sh_live_) or a Brevo key (starts xkeysib- or xsmtpsib-). Copy the whole key from your dashboard." }
    : /^sk_(live|test)_/.test(secret) ? checkSendbyte(secret, address)
    : /^sh_(live|test)_/.test(secret) ? checkSendhiiv(secret)
    : secret.includes("\n") ? checkBrevoSmtp(...secret.split("\n"))
    : checkBrevo(secret, address);
  const key = String(form.apiKey || "").trim().replace(/^["']|["']$/g, "");
  const fromName = String(form.fromName || "").trim().slice(0, 80) || "Usetally";
  const fromAddress = String(form.fromAddress || "").trim().toLowerCase();
  const service = createSupabaseService();
  const { data: current, error: readError } = await service.from("platform_settings").select("email_api_key_enc, email_from_address").eq("id", true).single();
  if (readError) return { error: /email_api_key_enc/.test(readError.message) ? "Run the new SQL first (supabase/RUN_NEW_2026-10-25b.sql), then try again." : readError.message };
  // Sendhiiv can send from its shared address, so the sender may be left empty there
  const sendhiiv = /^sh_(live|test)_/.test(key) || (!key && current?.email_api_key_enc && /^sh_/.test(decryptSecret(current.email_api_key_enc)));
  if (!(sendhiiv && !fromAddress) && !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(fromAddress)) return { error: "Enter the address emails should come from, like hello@usetally.cc." };
  if (!key && !current?.email_api_key_enc) return { error: "Paste your Sendbyte, Sendhiiv or Brevo API key." };
  // the saved key still works: changing it needs a code. If it no longer
  // works, a code couldn't be delivered anyway, so let the admin replace it.
  const savedWorks = current?.email_api_key_enc ? (await verify(decryptSecret(current.email_api_key_enc), current.email_from_address || fromAddress)).ok : false;
  if (savedWorks && (key || fromAddress !== current.email_from_address)) {
    const gate = await requireStepUp(ctx, "email_settings", null);
    if (gate) return gate;
  }
  const secret = key ? (/^xsmtpsib-/.test(key) ? `${smtpLogin}\n${key}` : key) : decryptSecret(current.email_api_key_enc);
  const check = await verify(secret, fromAddress);
  if (!check.ok) return { error: check.error };
  const update = { email_from_name: fromName, email_from_address: fromAddress, email_account: check.account || null, email_checked_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  if (key) { update.email_api_key_enc = encryptSecret(secret); update.email_key_hint = hint(key); }
  const { error } = await service.from("platform_settings").update(update).eq("id", true);
  if (error) return { error: error.message };
  forgetEmailConfig();
  if (key && current?.email_api_key_enc) await notifyAdmins({ subject: "Usetally email key changed", lines: [`${ctx.user.email} replaced the email API key at ${new Date().toUTCString()}.`, "If this wasn't you, sign in and replace it straight away."], link: "/admin/integrations" });
  revalidatePath("/admin", "layout");
  return check.senderNote
    ? { warning: true, messageTitle: "Key saved, one step left", message: check.senderNote }
    : { message: /^sk_/.test(secret) ? "Connected to Sendbyte. Send a test email to be sure." : /^sh_/.test(secret) ? "Connected to Sendhiiv. Send a test email to be sure." : `Connected to Brevo${check.account ? ` (${check.account})` : ""}. Send a test email to be sure.` };
}

// sends a test email to the signed-in admin and reports the mail server's answer
export async function sendTestEmail() {
  const ctx = await requirePlatformAdmin();
  try { return await sendTestEmailInner(ctx); }
  catch (e) { console.error("email_settings.test_failed", { message: e?.message }); return { error: serverProblem(e) }; }
}

async function sendTestEmailInner(ctx) {
  const { emailStatus, sendEmail } = await import("@/lib/email");
  const { adminAlertEmail } = await import("@/lib/emails");
  const status = await emailStatus();
  if (!status.ready) return { error: "Email isn't set up yet. Paste your Brevo API key above and save." };
  const r = await sendEmail({ to: ctx.user.email, ...adminAlertEmail({ subject: "Test email", heading: "Email is working", lines: ["If you can read this, Usetally can send sign-up codes, password resets and every other email."] }) });
  if (r.sent) return { message: `Sent to ${ctx.user.email}. Check your inbox (and spam).` };
  const who0 = { sendhiiv: "Sendhiiv", sendbyte: "Sendbyte" }[status.provider] || "Brevo";
  if (r.reason === "unreachable") return { error: r.detail, hints: [
    `${who0} didn't answer, so nothing was sent. Usetally retried once.`,
    `${who0} may be down. Check their status or contact them, or paste another provider's key above (Sendbyte, Sendhiiv or Brevo).`,
    "If SENDBYTE_API_URL or SENDHIIV_API_URL is set in Vercel → Settings → Environment Variables, delete it unless the provider gave you that address.",
    "Backup: SENDBYTE_API_KEY, SENDHIIV_API_KEY or SMTP settings in Vercel are used automatically when the main provider can't be reached.",
  ] };
  const login = /535|auth/i.test(r.detail || "");
  const who = { sendhiiv: "Sendhiiv", sendbyte: "Sendbyte" }[status.provider] || "Brevo";
  return { error: `${who} refused the email: ${r.detail || "no reason given"}`, hints: status.env.hints.length ? status.env.hints : status.source === "vercel" && login ? ["Easiest fix: paste a Brevo API key in the form above instead. It replaces the SMTP settings in Vercel."] : [] };
}

// Copies logos and signatures still in Supabase Storage to Cloudflare R2 and
// points the businesses at the copies. Safe to run again: files already on R2
// are skipped, and a file that fails stays where it is (still shown).
export async function moveImagesToR2() {
  await requirePlatformAdmin();
  const { r2Ready, r2Put } = await import("@/lib/storage");
  if (!(await r2Ready())) return { error: "Cloudflare R2 isn't connected yet. Save your R2 details above first." };
  const service = createSupabaseService();
  let { data: rows, error } = await service.from("businesses").select("id, logo_path, signature_path")
    .or("logo_path.not.is.null,signature_path.not.is.null").limit(2000);
  // before the signature update there is no signature_path column
  if (error) ({ data: rows, error } = await service.from("businesses").select("id, logo_path").not("logo_path", "is", null).limit(2000));
  if (error) return { error: error.message };
  let moved = 0, failed = 0;
  for (const b of rows || []) {
    const update = {};
    for (const field of ["logo_path", "signature_path"]) {
      const path = b[field];
      if (!path || path.startsWith("r2:") || path.startsWith("http")) continue;
      try {
        const { data: blob, error: dlError } = await service.storage.from("logos").download(path);
        if (dlError || !blob) throw new Error(dlError?.message || "missing");
        const ext = path.split(".").pop().toLowerCase();
        const type = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
        const kind = field === "logo_path" ? "logo" : "signature";
        const key = `${b.id}/${kind}-${Date.now()}.${ext === "jpeg" ? "jpg" : ext}`;
        await r2Put(key, Buffer.from(await blob.arrayBuffer()), type);
        update[field] = `r2:${key}`;
        moved++;
      } catch (e) { failed++; console.error("storage.move_failed", { business: b.id, field, message: e?.message }); }
    }
    if (Object.keys(update).length) {
      const { error: upError } = await service.from("businesses").update(update).eq("id", b.id);
      if (upError) { failed += Object.keys(update).length; moved -= Object.keys(update).length; }
    }
  }
  revalidatePath("/admin", "layout");
  return { moved, failed };
}

// Cloudflare R2 for logos, signatures and attached files, pasted here instead
// of Vercel. Checked (list, write, delete a test file) before it's saved;
// replacing working settings needs a security code.
export async function saveStorageSettings(form) {
  const ctx = await requirePlatformAdmin();
  try { return await saveStorageSettingsInner(ctx, form); }
  catch (e) { console.error("storage_settings.save_failed", { message: e?.message }); return { error: storageProblem(e) }; }
}

function storageProblem(e) {
  const m = String(e?.message || e || "");
  if (/r2_|column|schema cache/i.test(m)) return "The database needs the storage update first. Run supabase/RUN_NEW_2026-10-25f.sql in Supabase → SQL Editor, then try again.";
  if (/purpose_check|security_codes/i.test(m)) return "The database needs the storage update first. Run supabase/RUN_NEW_2026-10-25f.sql in Supabase → SQL Editor, then try again.";
  return serverProblem(e);
}

async function saveStorageSettingsInner(ctx, form) {
  const { r2Check, r2Problem, parseR2, forgetStorageConfig } = await import("@/lib/storage");
  const service = createSupabaseService();
  const { data: current, error: readError } = await service.from("platform_settings").select("r2_account_id, r2_bucket, r2_access_key_id, r2_secret_enc").eq("id", true).single();
  if (readError) return { error: storageProblem(readError) };
  const savedRaw = current?.r2_secret_enc ? { accountId: current.r2_account_id, bucket: current.r2_bucket, accessKeyId: current.r2_access_key_id, secretAccessKey: decryptSecret(current.r2_secret_enc) } : null;
  // empty secret: keep the saved one (so the bucket or account can be fixed alone)
  const raw = {
    accountId: String(form.accountId || "").trim() || savedRaw?.accountId || "",
    bucket: String(form.bucket || "").trim() || savedRaw?.bucket || "",
    accessKeyId: String(form.accessKeyId || "").trim() || savedRaw?.accessKeyId || "",
    secretAccessKey: String(form.secretAccessKey || "").trim() || savedRaw?.secretAccessKey || "",
    endpoint: process.env.R2_ENDPOINT,
  };
  const problem = r2Problem(raw);
  if (problem) return { error: problem };
  const next = parseR2(raw);
  const changed = !savedRaw || ["accountId", "bucket", "accessKeyId", "secretAccessKey"].some((k) => {
    const before = parseR2({ ...savedRaw, endpoint: process.env.R2_ENDPOINT });
    return !before || before[k] !== next[k];
  });
  if (savedRaw && changed && (await r2Check({ ...savedRaw, endpoint: process.env.R2_ENDPOINT })).ready) {
    const gate = await requireStepUp(ctx, "storage_settings", null);
    if (gate) return gate;
  }
  const check = await r2Check(raw);
  if (!check.ready) return { error: check.note };
  const { error } = await service.from("platform_settings").update({
    r2_account_id: next.accountId || raw.accountId, r2_bucket: next.bucket, r2_access_key_id: next.accessKeyId,
    r2_secret_enc: encryptSecret(next.secretAccessKey), r2_key_hint: hint(next.accessKeyId), r2_checked_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", true);
  if (error) return { error: storageProblem(error) };
  forgetStorageConfig();
  if (savedRaw && changed) await notifyAdmins({ subject: "Usetally file storage changed", lines: [`${ctx.user.email} changed the Cloudflare R2 settings at ${new Date().toUTCString()}.`, "If this wasn't you, sign in and fix them straight away."], link: "/admin/integrations" });
  revalidatePath("/admin", "layout");
  return { message: `Connected to bucket ${next.bucket}. New logos, signatures and attachments are saved to Cloudflare.` };
}

// ---------------------------------------------------------------- dashboard-managed settings
const NEEDS_SETTINGS_SQL = "The database needs the settings update first. Run supabase/RUN_NEW_2026-10-25h.sql in Supabase → SQL Editor, then try again.";
async function savePlatform(row, paths = []) {
  const { forgetPlatformConfig } = await import("@/lib/platform-config");
  const { error } = await createSupabaseService().from("platform_settings").update({ ...row, updated_at: new Date().toISOString() }).eq("id", true);
  if (error) return { error: /column|schema cache/i.test(error.message) ? NEEDS_SETTINGS_SQL : error.message };
  forgetPlatformConfig();
  revalidatePath("/admin", "layout");
  for (const p of paths) revalidatePath(p);
  return null;
}
const field = (v, max = 300) => String(v ?? "").trim().slice(0, max);

// Sabilytics and/or Google Analytics, loaded on the live site
export async function saveAnalytics(form) {
  await requirePlatformAdmin();
  const site = field(form.sabilyticsSite, 60), domain = field(form.sabilyticsDomain, 120).replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const ga = field(form.gaId, 30).toUpperCase();
  if (site && !/^[A-Za-z0-9_-]{4,60}$/.test(site)) return { error: "The Sabilytics site ID should be letters and numbers, like 9h09ynxhgfc3 (data-site in their snippet)." };
  if (site && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return { error: "Enter the domain exactly as set up in Sabilytics, like usetally.cc (data-domain in their snippet)." };
  if (ga && !/^G-[A-Z0-9]{4,}$/.test(ga)) return { error: "A Google Analytics measurement ID looks like G-XXXXXXXXXX." };
  const err = await savePlatform({ analytics_sabilytics_site: site || null, analytics_sabilytics_domain: site ? domain : null, analytics_ga_id: ga || null }, ["/subprocessors"]);
  if (err) return err;
  return { message: site || ga ? "Analytics saved. It starts loading on the live site within 5 minutes, no redeploy needed." : "Analytics turned off." };
}

// who operates Usetally, shown on the Terms, Privacy, DPA and Sub-processors pages
export async function saveCompanyLegal(form) {
  await requirePlatformAdmin();
  const email = field(form.email, 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return { error: "Enter a valid contact email." };
  const err = await savePlatform({
    legal_company: field(form.company, 200) || null, legal_address: field(form.address, 500) || null, legal_email: email || null,
    legal_law: field(form.law, 200) || null, legal_courts: field(form.courts, 200) || null, legal_data_region: field(form.region, 120) || null,
  }, ["/terms", "/privacy", "/dpa", "/subprocessors"]);
  if (err) return err;
  return { message: "Company details saved. The legal pages update within a minute." };
}

// who gets security and billing alerts
export async function saveAlerts(form) {
  await requirePlatformAdmin();
  const list = field(form.emails, 1000).split(/[\s,;]+/).filter(Boolean);
  const bad = list.find((e) => !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e));
  if (bad) return { error: `"${bad}" isn't a valid email address.` };
  const err = await savePlatform({ alert_emails: list.length ? list.join(", ") : null });
  if (err) return err;
  return { message: list.length ? `Alerts go to ${list.length} address${list.length === 1 ? "" : "es"}.` : "Alerts go to every platform admin." };
}

// show or hide the live totals on the website
export async function savePublicStats(on) {
  await requirePlatformAdmin();
  const err = await savePlatform({ public_stats: Boolean(on) }, ["/"]);
  if (err) return /public_stats/.test(err.error) || err.error === NEEDS_SETTINGS_SQL ? { error: "Run supabase/RUN_NEW_2026-10-25i.sql in Supabase → SQL Editor first, then try again." } : err;
  return { message: on ? "The live numbers show on the website within 10 minutes." : "The live numbers are hidden from the website." };
}

// ---------------------------------------------------------------- monitoring
export async function runHealthChecks() {
  await requirePlatformAdmin();
  const { runChecks } = await import("@/lib/monitor");
  const out = await runChecks();
  revalidatePath("/admin/health");
  const down = out.results.filter((r) => r.status === "down").length, warn = out.results.filter((r) => r.status === "warn").length;
  if (out.note) return { warning: true, message: out.note };
  return down ? { error: `${down} check${down === 1 ? "" : "s"} failing. See the list.` } : warn ? { warning: true, message: `All working, ${warn} warning${warn === 1 ? "" : "s"}.` } : { message: "Everything is working." };
}

export async function saveAlertWebhook(raw) {
  await requirePlatformAdmin();
  const url = String(raw || "").trim();
  const service = createSupabaseService();
  if (!url) {
    const { error } = await service.from("platform_settings").update({ alert_webhook_enc: null, alert_webhook_hint: "" }).eq("id", true);
    revalidatePath("/admin/health");
    return error ? { error: "Run RUN_NEW_2026-10-26e.sql in Supabase first." } : { message: "Alert webhook removed. Alerts go by email only." };
  }
  let u;
  try { u = new URL(url); } catch { return { error: "That isn't a web address. Paste the whole webhook URL." }; }
  if (u.protocol !== "https:") return { error: "The webhook address must start with https://" };
  if (u.hostname === "api.telegram.org" && !u.searchParams.get("chat_id")) return { error: "For Telegram, add ?chat_id=YOUR_CHAT_ID to the end of the address." };
  const { postToWebhook } = await import("@/lib/monitor");
  try { await postToWebhook(url, "✅ Usetally alerts are connected. You'll get a message here when something breaks."); }
  catch (e) { return { error: `The webhook didn't accept a test message: ${String(e?.message || e).slice(0, 200)}` }; }
  const where = u.hostname === "api.telegram.org" ? "Telegram" : /slack\.com$/.test(u.hostname) ? "Slack" : /discord(app)?\.com$/.test(u.hostname) ? "Discord" : u.hostname;
  const { error } = await service.from("platform_settings").update({ alert_webhook_enc: encryptSecret(url), alert_webhook_hint: where }).eq("id", true);
  revalidatePath("/admin/health");
  return error ? { error: "Run RUN_NEW_2026-10-26e.sql in Supabase first." } : { message: `Connected to ${where}. A test message was sent there.` };
}

export async function sendTestAlert() {
  await requirePlatformAdmin();
  const { sendAlert } = await import("@/lib/monitor");
  const ok = await sendAlert(["🧪 Test alert: this is what you'll get when something breaks."]);
  return ok ? { message: "Test alert sent to your webhook and/or alert email." } : { error: "The test alert couldn't be delivered anywhere. Add a webhook below, and check Admin → Integrations → Email." };
}

// ---------------------------------------------------------------- tax filing (VAT returns)
export async function saveConsultant(form) {
  await requirePlatformAdmin();
  const row = {
    name: String(form.name || "").trim().slice(0, 120), firm: String(form.firm || "").trim().slice(0, 120),
    email: String(form.email || "").trim().toLowerCase().slice(0, 200), phone: String(form.phone || "").trim().slice(0, 40),
    citn_number: String(form.citn || "").trim().slice(0, 40),
  };
  if (!row.name) return { error: "Enter the consultant's name." };
  if (!/^\S+@\S+\.\S+$/.test(row.email)) return { error: "Enter a valid email: requests are sent there." };
  const service = createSupabaseService();
  const { error } = form.id ? await service.from("tax_consultants").update(row).eq("id", form.id) : await service.from("tax_consultants").insert(row);
  revalidatePath("/admin/tax");
  if (error) return { error: /tax_consultants/.test(error.message) ? "Run RUN_NEW_2026-10-27a.sql in Supabase first." : error.message };
  return { message: form.id ? "Consultant updated." : `${row.name} added. New requests are shared between active consultants.` };
}

export async function setConsultantActive(id, active) {
  await requirePlatformAdmin();
  await createSupabaseService().from("tax_consultants").update({ active: Boolean(active) }).eq("id", id);
  revalidatePath("/admin/tax");
  return { message: active ? "Consultant is active again." : "Consultant paused: they get no new requests." };
}

// a new private link (the old one stops working)
export async function newConsultantLink(id) {
  await requirePlatformAdmin();
  const { randomBytes } = await import("node:crypto");
  await createSupabaseService().from("tax_consultants").update({ access_token: randomBytes(24).toString("hex") }).eq("id", id);
  revalidatePath("/admin/tax");
  return { message: "New link created. The old one no longer works." };
}

export async function assignConsultant(returnId, consultantId) {
  await requirePlatformAdmin();
  const service = createSupabaseService();
  const { data: ret } = await service.from("vat_returns").select("*").eq("id", returnId).maybeSingle();
  if (!ret) return { error: "That request wasn't found." };
  const { data: c } = consultantId ? await service.from("tax_consultants").select("*").eq("id", consultantId).maybeSingle() : { data: null };
  await service.from("vat_returns").update({ consultant_id: c?.id || null, updated_at: new Date().toISOString() }).eq("id", returnId);
  if (c && ret.status === "requested") {
    const { data: business } = await service.from("businesses").select("id, name, tax_id").eq("id", ret.business_id).maybeSingle();
    const { notifyConsultant } = await import("@/lib/vat-returns");
    await notifyConsultant(service, c, ret, business);
  }
  revalidatePath("/admin/tax");
  return { message: c ? `Assigned to ${c.name}${ret.status === "requested" ? ". They've been emailed." : "."}` : "Unassigned." };
}

export async function saveFilingFee(amount) {
  await requirePlatformAdmin();
  const minor = toMinor(amount || 0);
  if (!Number.isFinite(minor) || minor < 0) return { error: "Enter an amount, or 0 for free." };
  const { error } = await createSupabaseService().from("platform_settings").update({ tax_filing_fee_minor: minor }).eq("id", true);
  revalidatePath("/admin/tax");
  return error ? { error: "Run RUN_NEW_2026-10-27a.sql in Supabase first." } : { message: minor ? "Fee saved. Businesses see it before they request." : "Set to free while testing." };
}
