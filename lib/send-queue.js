import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { emailConfigured, sendEmail } from "@/lib/email";
import { documentViewedEmail, sentDocumentEmail } from "@/lib/emails";
import { DEFAULT_MESSAGE, defaultSubject, fillTemplate, messageParagraphs, sendVars } from "@/lib/send-core";
import { absoluteLogoUrl, siteUrl } from "@/lib/site";
import { documentForEmail, withDocument } from "@/lib/email-document";

// The send queue (supabase/migrations/20261101000200_send_queue.sql).
// Emails are picked up three ways, so none is lost if the app restarts:
// right after the 10-second Undo window (the send action waits for it), when
// the team opens an invoice, and by the daily job.

const missingSql = (error) => /document_sends|claim_due_sends|run_due_recurrences|claim_view_notice|does not exist|schema cache/i.test(error?.message || "");

// the business's saved message (Settings → Reminders adds email_template_invoice)
export async function savedMessage(supabase, businessId) {
  const { data, error } = await supabase.from("businesses").select("email_template_invoice").eq("id", businessId).maybeSingle();
  return error ? "" : String(data?.email_template_invoice || "");
}

async function deliver(service, row) {
  const [{ data: doc }, { data: business }] = await Promise.all([
    service.from("documents").select("*").eq("id", row.document_id).maybeSingle(),
    service.from("businesses").select("id, name, email, logo_path, brand_color").eq("id", row.business_id).maybeSingle(),
  ]);
  if (!doc || !business) return { ok: false, reason: "The invoice was deleted." };
  if (doc.status === "void") return { ok: false, reason: "The invoice was voided before the email went." };
  const link = `${siteUrl()}/d/${doc.access_token}`;
  const vars = sendVars(doc, business.name, link);
  const template = row.message || (await savedMessage(service, business.id)) || DEFAULT_MESSAGE[doc.kind === "quote" ? "quote" : "invoice"];
  // the document itself, in the template the business picked, goes with it as a PDF
  const extra = row.include_pdf ? await documentForEmail(service, doc, business) : { attachment: null, color: null };
  const msg = withDocument(({ color, attached }) => sentDocumentEmail({
    business, logo: absoluteLogoUrl(business.logo_path), doc, link, color, attached,
    subject: fillTemplate(row.subject || defaultSubject(doc, business.name), vars),
    paragraphs: messageParagraphs(fillTemplate(template, vars), link),
    pdfLink: row.include_pdf ? `${link}/pdf?download` : null,
  }), extra);
  const base = { replyTo: business.email || undefined, fromName: business.name, ...msg };
  const main = await sendEmail({ to: row.to_email, ...base }).catch((e) => ({ sent: false, detail: String(e?.message || e) }));
  if (!main.sent) return { ok: false, reason: main.reason === "not_configured" ? "Email isn't set up on this Usetally." : "We couldn't send this email. The address may not exist." };
  // each CC gets their own copy (the address the invoice is for stays private)
  for (const cc of row.cc || []) await sendEmail({ to: cc, ...base }).catch(() => null);
  return { ok: true };
}

// sends what is due: everything (cron), one business (page loads) or given ids
export async function processDueSends({ ids, businessId, limit = 20 } = {}) {
  const service = createSupabaseService();
  const { data: rows, error } = await service.rpc("claim_due_sends", { max_rows: limit, only_ids: ids?.length ? ids : null, only_business: businessId || null });
  if (error) return missingSql(error) ? { sent: 0, skipped: "needs_sql" } : { sent: 0, error: error.message };
  let sent = 0, failed = 0;
  for (const row of rows || []) {
    const r = await deliver(service, row).catch((e) => ({ ok: false, reason: String(e?.message || e).slice(0, 200) }));
    await service.rpc("finish_document_send", { send_id: row.id, ok: r.ok, reason: r.reason || "" });
    if (r.ok) sent++; else failed++;
  }
  return { sent, failed };
}

// "Send now": wait out the Undo window, then send that one email
export async function sendAfterUndo(sendId, sendAfter) {
  const wait = Math.max(0, new Date(sendAfter).getTime() - Date.now()) + 600;
  await new Promise((r) => setTimeout(r, Math.min(wait, 15000)));
  return processDueSends({ ids: [sendId], limit: 1 });
}

// a quick, throttled catch-up when the team is in the app (per server instance)
const lastPickup = new Map();
export async function pickupSoon(businessId) {
  const now = Date.now();
  if (now - (lastPickup.get(businessId) || 0) < 60000) return null;
  lastPickup.set(businessId, now);
  return processDueSends({ businessId, limit: 10 }).catch(() => null);
}

// the daily job: repeating invoices first (they may queue emails), then the queue
export async function runSendJobs() {
  const service = createSupabaseService();
  const { data, error } = await service.rpc("run_due_recurrences", { max_rows: 100 });
  const recurring = error ? (missingSql(error) ? { skipped: "needs_sql" } : { error: error.message }) : { made: (data || []).filter((r) => r.new_id).length, checked: (data || []).length };
  const sends = await processDueSends({ limit: 50 });
  return { recurring, sends };
}

// tells the team their client opened an invoice (at most once a day per invoice)
export async function notifyViewed(docId) {
  if (!(await emailConfigured())) return { sent: 0, skipped: "email_not_configured" };
  const service = createSupabaseService();
  const { data: claim, error } = await service.rpc("claim_view_notice", { doc_id: docId });
  if (error || !claim) return { sent: 0 };
  const { data: doc } = await service.from("documents").select("id, business_id, kind, number, customer_name, customer_company, total_minor, amount_paid_minor, currency, due_date").eq("id", docId).maybeSingle();
  if (!doc) return { sent: 0 };
  const [{ data: business }, { data: team }] = await Promise.all([
    service.from("businesses").select("name").eq("id", doc.business_id).maybeSingle(),
    service.from("memberships").select("email").eq("business_id", doc.business_id).in("role", ["owner", "manager", "finance"]),
  ]);
  const to = [...new Set((team || []).map((m) => m.email).filter(Boolean))];
  if (!business || !to.length) return { sent: 0 };
  const msg = documentViewedEmail({ business, doc, link: `${siteUrl()}/app/documents/${doc.id}` });
  let sent = 0;
  for (const email of to) { const r = await sendEmail({ to: email, ...msg }).catch(() => ({ sent: false })); if (r.sent) sent++; }
  return { sent };
}
