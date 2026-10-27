import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseService } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { monthOf } from "@/lib/tax";
import { inNigeria } from "@/lib/einvoice";
import { emailConfigured, sendEmail } from "@/lib/email";
import { vatFiledEmail, vatReminderEmail, vatRequestConsultantEmail } from "@/lib/emails";
import { MAX_FILE_BYTES, cleanFileName, fileTypeOf, formatSize } from "@/lib/file-types";

// Monthly VAT returns: to_file → requested → filed → done.
// "requested" means the business asked Usetally to file it; a tax consultant
// (tax_consultants) is assigned, gets an email with a private link, files on
// Rev360 and records the result. Businesses can also file themselves.

export const STATUS = { to_file: "To file", requested: "Requested", filed: "Filed, to pay", done: "Done" };
const PROOF = ["pdf", "png", "jpg", "jpeg", "webp", "heic"];
const NEEDS_SQL = "VAT returns need a database update. Run RUN_NEW_2026-10-27a.sql in Supabase, then try again.";
const missing = (e) => /vat_returns|tax_consultants|vat_return_files|tax_filing_fee/.test(e?.message || "");

// VAT and sales before tax on invoices issued in a month
export async function monthNumbers(sb, business, period) {
  const m = monthOf(period);
  const { data } = await sb.from("documents").select("tax_minor, total_minor, currency").eq("business_id", business.id).eq("kind", "invoice")
    .not("sent_at", "is", null).neq("status", "void").gte("issue_date", m.start).lt("issue_date", m.next).limit(5000);
  const mine = (data || []).filter((d) => d.currency === business.currency);
  return { vat: mine.reduce((t, d) => t + Number(d.tax_minor || 0), 0), sales: mine.reduce((t, d) => t + Number(d.total_minor) - Number(d.tax_minor || 0), 0), invoices: mine.length };
}

// the month's return, created on first use with the current numbers
export async function ensureReturn(service, business, period) {
  const { data: existing, error } = await service.from("vat_returns").select("*").eq("business_id", business.id).eq("period", period).maybeSingle();
  if (error) throw new Error(missing(error) ? NEEDS_SQL : error.message);
  const nums = await monthNumbers(service, business, period);
  if (existing) {
    // numbers follow the invoices until the return is filed
    if (["to_file", "requested"].includes(existing.status) && (existing.vat_minor !== nums.vat || existing.sales_minor !== nums.sales)) {
      await service.from("vat_returns").update({ vat_minor: nums.vat, sales_minor: nums.sales }).eq("id", existing.id);
      return { ...existing, vat_minor: nums.vat, sales_minor: nums.sales };
    }
    return existing;
  }
  const { data, error: e } = await service.from("vat_returns").insert({ business_id: business.id, period, currency: business.currency, vat_minor: nums.vat, sales_minor: nums.sales, status: "to_file", mode: "self" }).select("*").single();
  if (e) {
    // created at the same moment elsewhere
    const { data: again } = await service.from("vat_returns").select("*").eq("business_id", business.id).eq("period", period).maybeSingle();
    if (again) return again;
    throw new Error(e.message);
  }
  return data;
}

export async function filingFee(service = createSupabaseService()) {
  const { data } = await service.from("platform_settings").select("tax_filing_fee_minor").eq("id", true).maybeSingle();
  return Number(data?.tax_filing_fee_minor || 0);
}

// the business's people who handle money: owner, managers, finance
async function teamEmails(service, businessId) {
  const { data } = await service.from("memberships").select("email").eq("business_id", businessId).in("role", ["owner", "manager", "finance"]);
  return [...new Set((data || []).map((m) => m.email).filter(Boolean))];
}

async function mailAll(to, msg) {
  if (!to.length || !(await emailConfigured())) return 0;
  let sent = 0;
  for (const email of to) { const r = await sendEmail({ to: email, ...msg }).catch(() => ({ sent: false })); if (r.sent) sent++; }
  return sent;
}

export function consultantLink(c) { return `${siteUrl()}/consultant/${c.access_token}`; }

// the active consultant with the fewest open requests
async function pickConsultant(service) {
  const { data: list } = await service.from("tax_consultants").select("*").eq("active", true).order("created_at");
  if (!list?.length) return null;
  const { data: open } = await service.from("vat_returns").select("consultant_id").in("status", ["requested", "filed"]).not("consultant_id", "is", null);
  const load = (id) => (open || []).filter((r) => r.consultant_id === id).length;
  return list.slice().sort((a, b) => load(a.id) - load(b.id))[0];
}

export async function notifyConsultant(service, consultant, ret, business) {
  const m = monthOf(ret.period);
  return mailAll([consultant.email], vatRequestConsultantEmail({ consultant, business, periodLabel: m.label, vat: formatMoney(ret.vat_minor, ret.currency), due: formatDate(m.due), link: consultantLink(consultant) }));
}

// ---------------------------------------------------------------- business actions
export async function requestFiling(ctx, period, note) {
  const service = createSupabaseService();
  const ret = await ensureReturn(service, ctx.business, period);
  if (ret.status !== "to_file") return { error: "This month is already being handled." };
  const consultant = await pickConsultant(service);
  const who = ctx.member.full_name || ctx.user.email;
  const { error } = await service.from("vat_returns").update({ status: "requested", mode: "assisted", consultant_id: consultant?.id || null, requested_at: new Date().toISOString(),
    requested_by_name: who, request_note: String(note || "").slice(0, 1000), updated_at: new Date().toISOString() }).eq("id", ret.id).eq("status", "to_file");
  if (error) return { error: missing(error) ? NEEDS_SQL : "Couldn't send the request. Try again." };
  const m = monthOf(period), b = ctx.business;
  // you (the platform) hear about it at once, and the consultant gets the job
  const lines = [`${b.name} asked Usetally to file their ${m.label} VAT return.`, `VAT charged: ${formatMoney(ret.vat_minor, ret.currency)} · due ${formatDate(m.due)}`, `Requested by ${who}${note ? `: "${String(note).slice(0, 200)}"` : ""}`,
    consultant ? `Assigned to ${consultant.name} (${consultant.email}).` : "No consultant is set up yet: assign one in Admin → Tax filing."];
  const { notifyAdmins } = await import("@/lib/admin-alerts");
  await notifyAdmins({ subject: `VAT filing request: ${b.name}, ${m.label}`, heading: "New VAT filing request", lines, link: "/admin/tax" }).catch(() => {});
  const { postToWebhook } = await import("@/lib/monitor");
  const hook = await service.from("platform_settings").select("alert_webhook_enc").eq("id", true).maybeSingle().then((r) => r.data?.alert_webhook_enc, () => null);
  if (hook) { const { decryptSecret } = await import("@/lib/crypto"); await postToWebhook(decryptSecret(hook), `🧾 ${lines.join("\n")}\n${siteUrl()}/admin/tax`).catch(() => {}); }
  if (consultant) await notifyConsultant(service, consultant, ret, b);
  await service.from("monitor_events").insert({ kind: "tax_filing", detail: lines[0] }).then(() => {}, () => {});
  return { message: consultant ? `Request sent. ${consultant.name} will be in touch to get access in Rev360.` : "Request sent. We'll be in touch to get access in Rev360." };
}

export async function markFiled(service, ret, { reference, amountDue, paymentReference, by }) {
  const amount = Number.isFinite(amountDue) && amountDue >= 0 ? amountDue : ret.vat_minor;
  const { error } = await service.from("vat_returns").update({ status: "filed", filed_at: new Date().toISOString(), filed_by_name: by, filing_reference: String(reference || "").slice(0, 120),
    amount_due_minor: amount, payment_reference: String(paymentReference || "").slice(0, 120), updated_at: new Date().toISOString() }).eq("id", ret.id).in("status", ["to_file", "requested"]);
  if (error) return { error: "Couldn't save. Try again." };
  return { ok: true, amount };
}

export async function notifyFiled(service, ret, business, { amount, by }) {
  const m = monthOf(ret.period);
  return mailAll(await teamEmails(service, business.id), vatFiledEmail({ business, periodLabel: m.label, amount: formatMoney(amount, ret.currency), reference: ret.payment_reference, due: formatDate(m.due), filedBy: by, link: `${siteUrl()}/app/tax?period=${ret.period}` }));
}

export async function markDone(service, ret) {
  const { error } = await service.from("vat_returns").update({ status: "done", done_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ret.id).eq("status", "filed");
  return error ? { error: "Couldn't save. Try again." } : { ok: true };
}

// acknowledgement or payment receipt, kept privately on R2
export async function saveReturnFile(service, ret, kind, file, by) {
  if (!file || typeof file === "string" || !file.size) return { skipped: true };
  const type = fileTypeOf(file.name);
  if (!type || !PROOF.includes(file.name.split(".").pop().toLowerCase())) return { error: "Upload a PDF or a photo (screenshot) of the document." };
  if (file.size > MAX_FILE_BYTES) return { error: `That file is ${formatSize(file.size)}. It can be up to 4 MB.` };
  const { r2Put, r2Ready, r2Delete } = await import("@/lib/storage");
  if (!(await r2Ready())) return { error: "File storage isn't connected, so the file couldn't be kept." };
  const id = randomUUID(), key = `${ret.business_id}/tax/${ret.id}/${id}.${type.ext}`;
  await r2Put(key, new Uint8Array(await file.arrayBuffer()), type.mime);
  const { error } = await service.from("vat_return_files").insert({ id, return_id: ret.id, business_id: ret.business_id, kind, name: cleanFileName(file.name), content_type: type.mime, size_bytes: file.size, storage_key: key, uploaded_by_name: by });
  if (error) { await r2Delete(key).catch(() => {}); return { error: "The file couldn't be saved." }; }
  return { ok: true };
}

// ---------------------------------------------------------------- reminders (daily job)
// Last month's return is due on the 21st: remind 7 days and 2 days before,
// for businesses that charged VAT and haven't finished.
export async function sendVatReminders(now = new Date()) {
  const service = createSupabaseService();
  const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const period = `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, "0")}`;
  const m = monthOf(period);
  // whole calendar days until the 21st (14th → 7, 19th → 2)
  const days = Math.round((Date.parse(`${m.due}T00:00:00Z`) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400_000);
  const which = days <= 2 && days >= 0 ? "reminded_2_at" : days <= 7 && days > 2 ? "reminded_7_at" : null;
  if (!which) return { period, days, sent: 0 };
  const { error: tableError } = await service.from("vat_returns").select("id").limit(1);
  if (tableError) return { skipped: "needs_sql" };
  // businesses that charged VAT last month
  const { data: docs } = await service.from("documents").select("business_id").eq("kind", "invoice").not("sent_at", "is", null).neq("status", "void")
    .gt("tax_minor", 0).gte("issue_date", m.start).lt("issue_date", m.next).limit(20000);
  const ids = [...new Set((docs || []).map((d) => d.business_id))];
  let sent = 0;
  for (const id of ids) {
    const { data: business } = await service.from("businesses").select("id, name, currency, country, deletion_requested_at").eq("id", id).maybeSingle();
    if (!business || business.deletion_requested_at || !inNigeria(business)) continue;
    const ret = await ensureReturn(service, business, period).catch(() => null);
    if (!ret || ret.status === "done" || ret[which] || ret.vat_minor <= 0) continue;
    // a consultant is already on it: only remind once it's filed (to pay)
    if (ret.status === "requested") continue;
    await service.from("vat_returns").update({ [which]: now.toISOString() }).eq("id", ret.id);
    sent += await mailAll(await teamEmails(service, id), vatReminderEmail({ business, periodLabel: m.label, vat: formatMoney(ret.vat_minor, ret.currency), due: formatDate(m.due), days: Math.max(days, 0), status: ret.status, link: `${siteUrl()}/app/tax?period=${period}` }));
  }
  return { period, days, businesses: ids.length, sent };
}
