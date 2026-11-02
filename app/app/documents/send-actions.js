"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { friendlyError, requireBusiness } from "@/lib/context";
import { can } from "@/lib/permissions";
import { emailConfigured } from "@/lib/email";
import { parseEmails, looksLikeEmail } from "@/lib/send-core";
import { sendAfterUndo } from "@/lib/send-queue";
import { featuresOf, hasFeature, upgradeMessage } from "@/lib/entitlements";

// The send sheet's actions (components/send-sheet.js). The queue itself is in
// lib/send-queue.js and supabase/migrations/20261101000200_send_queue.sql.

function refresh(id) {
  revalidatePath("/app", "layout");
  if (id) revalidatePath(`/app/documents/${id}`);
}
const maySend = (ctx) => can(ctx.member, "documents.send") || (ctx.member.role === "junior_finance" && !ctx.business.require_approval);
const needsSql = (error) => /queue_document_send|cancel_document_send|set_document_recurrence|record_document_share|document_sends|does not exist|schema cache/i.test(error?.message || "");
const SQL_MSG = "This needs a quick database update. Ask the Usetally team to run RUN_NEW_2026-11-01b.sql.";

function readEmailForm(form) {
  const to = String(form.to || "").trim().toLowerCase();
  if (!looksLikeEmail(to)) return { error: "That email doesn't look right. Check for a typo." };
  const { emails: cc, bad } = parseEmails(form.cc, { not: [to] });
  if (bad.length) return { error: `CC: ${bad[0]} doesn't look right. Check for a typo.` };
  if (cc.length > 5) return { error: "Add at most 5 CC addresses." };
  return { to, cc, subject: String(form.subject || "").replace(/\s+/g, " ").trim().slice(0, 200), message: String(form.message || "").replace(/\r\n/g, "\n").slice(0, 4000), includePdf: form.includePdf !== false };
}

// remembers the message as the business default (Settings adds the column)
async function saveDefault(ctx, message) {
  if (!can(ctx.member, "settings.business")) return;
  await ctx.supabase.from("businesses").update({ email_template_invoice: message.slice(0, 2000) }).eq("id", ctx.business.id);
}

// "Send now": the document is marked sent straight away (the link works),
// and the email waits 10 seconds so it can be undone.
export async function sendNow(id, form) {
  const ctx = await requireBusiness();
  if (!maySend(ctx)) return { error: "A manager or finance officer needs to approve and send this." };
  const f = readEmailForm(form);
  if (f.error) return f;
  const { data: doc } = await ctx.supabase.from("documents").select("id, status, updated_at").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!doc) return { error: "Document not found." };
  const wasDraft = ["draft", "pending_approval"].includes(doc.status);
  if (wasDraft) {
    const { error } = await ctx.supabase.rpc("mark_document_sent", { doc_id: id, expected_updated_at: form.expected || null });
    if (error) return { error: friendlyError(error) };
  }
  if (!(await emailConfigured())) {
    refresh(id);
    return { warning: "Marked as sent. Email isn't set up on this Usetally, so copy the link or share it on WhatsApp." };
  }
  const { data, error } = await ctx.supabase.rpc("queue_document_send", {
    doc_id: id, to_email: f.to, cc: f.cc, subject: f.subject, message: f.message, include_pdf: f.includePdf, send_at: null, mark_on_send: false,
  });
  if (error) { refresh(id); return { error: needsSql(error) ? SQL_MSG : friendlyError(error) }; }
  if (form.saveDefault && f.message) await saveDefault(ctx, f.message).catch(() => null);
  after(() => sendAfterUndo(data.id, data.send_after));
  refresh(id);
  return { sendId: data.id, sendAfter: data.send_after, to: data.to, wasDraft };
}

export async function undoSend(sendId) {
  const ctx = await requireBusiness();
  const { data, error } = await ctx.supabase.rpc("cancel_document_send", { send_id: sendId });
  if (error) return { error: needsSql(error) ? SQL_MSG : friendlyError(error) };
  if (!data?.cancelled) return { error: data?.status === "sent" || data?.status === "sending" ? "Too late: the email has already gone." : "That email can't be stopped now." };
  const { data: row } = await ctx.supabase.from("document_sends").select("document_id").eq("id", sendId).maybeSingle();
  refresh(row?.document_id);
  return { message: "Email stopped. The invoice stays marked as sent, so you can still share the link." };
}

// "Schedule…": the email (and the move to Sent) waits until the chosen time
export async function scheduleSend(id, form) {
  const ctx = await requireBusiness();
  if (!maySend(ctx)) return { error: "A manager or finance officer needs to approve and send this." };
  const f = readEmailForm(form);
  if (f.error) return f;
  if (!hasFeature(await featuresOf(ctx.supabase, ctx.business.id), "scheduled_sending")) return { error: upgradeMessage("scheduled_sending"), upgrade: true };
  const at = new Date(form.at);
  if (!Number.isFinite(at.getTime()) || at.getTime() < Date.now() + 60000) return { error: "Choose a time at least a minute from now." };
  if (!(await emailConfigured())) return { error: "Email isn't set up on this Usetally, so it can't be scheduled. Share the link instead." };
  const { data, error } = await ctx.supabase.rpc("queue_document_send", {
    doc_id: id, to_email: f.to, cc: f.cc, subject: f.subject, message: f.message, include_pdf: f.includePdf, send_at: at.toISOString(), mark_on_send: true,
  });
  if (error) return { error: needsSql(error) ? SQL_MSG : friendlyError(error) };
  if (form.saveDefault && f.message) await saveDefault(ctx, f.message).catch(() => null);
  refresh(id);
  return { scheduled: data.send_after, to: data.to };
}

export async function cancelScheduled(sendId, docId) {
  const ctx = await requireBusiness();
  const { data, error } = await ctx.supabase.rpc("cancel_document_send", { send_id: sendId });
  if (error) return { error: needsSql(error) ? SQL_MSG : friendlyError(error) };
  refresh(docId);
  return data?.cancelled ? { message: "Scheduled email cancelled." } : { error: "It has already gone." };
}

// "Make recurring": weekly or monthly, a draft copy each time (or sent, with auto-send on)
export async function setRecurrence(id, { interval, startOn, autoSend }) {
  const ctx = await requireBusiness();
  const every = interval === "weekly" || interval === "monthly" ? interval : null;
  // turning repeating off always works; turning it on is a paid feature
  if (every && !hasFeature(await featuresOf(ctx.supabase, ctx.business.id), "scheduled_sending")) return { error: upgradeMessage("scheduled_sending"), upgrade: true };
  const { data, error } = await ctx.supabase.rpc("set_document_recurrence", { doc_id: id, every, next_on: every ? startOn : null, auto_send: Boolean(every && autoSend) });
  if (error) return { error: needsSql(error) ? SQL_MSG : friendlyError(error) };
  refresh(id);
  return { message: every ? `Repeats ${every}. The next one is made on ${new Date(`${data.next_on}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.` : "This invoice no longer repeats." };
}

// WhatsApp, link, QR, PDF: a draft is marked sent first so its link opens
export async function shareDocument(id, channel) {
  const ctx = await requireBusiness();
  const { data: doc } = await ctx.supabase.from("documents").select("id, status").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!doc) return { error: "Document not found." };
  if (["draft", "pending_approval"].includes(doc.status)) {
    if (!maySend(ctx)) return { error: "A manager or finance officer needs to approve and send this." };
    const { error } = await ctx.supabase.rpc("mark_document_sent", { doc_id: id, expected_updated_at: null });
    if (error) return { error: friendlyError(error) };
  }
  const { error } = await ctx.supabase.rpc("record_document_share", { doc_id: id, chan: channel });
  if (error && !needsSql(error)) return { error: friendlyError(error) };
  refresh(id);
  return { ok: true, marked: ["draft", "pending_approval"].includes(doc.status) };
}

// Record payment, then (if asked) email the receipt, so the detail page can
// say "Receipt sent to …" and celebrate when the invoice is paid in full.
export async function recordPaymentNotify(id, form) {
  const { recordPayment, emailReceipt } = await import("./actions");
  const r = await recordPayment(id, form);
  if (r?.error) return r;
  const ctx = await requireBusiness();
  const { data: doc } = await ctx.supabase.from("documents").select("status, customer_email, customer_name, customer_company").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  let receiptTo = null, receiptError = null;
  if (form.emailReceipt && doc?.customer_email) {
    const { data: rec } = await ctx.supabase.from("receipts").select("id").eq("document_id", id).order("issued_at", { ascending: false }).limit(1).maybeSingle();
    const e = rec ? await emailReceipt(rec.id) : { error: "No receipt was issued." };
    if (e?.error) receiptError = e.error; else receiptTo = doc.customer_company || doc.customer_name || doc.customer_email;
  }
  return { ...r, paid: doc?.status === "paid", receiptTo, receiptError };
}

// One-tap "Remind" (dashboard, invoices list, invoice page): emails the customer
// a short reminder with the link to pay. Same queue as Send, so it can be undone
// for 10 seconds and shows on the invoice's timeline.
export async function sendReminder(id) {
  const ctx = await requireBusiness();
  if (!maySend(ctx)) return { error: "A manager or finance officer needs to send reminders." };
  const { data: doc } = await ctx.supabase.from("documents")
    .select("id, kind, status, number, currency, total_minor, amount_paid_minor, due_date, customer_name, customer_email, access_token")
    .eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!doc) return { error: "Invoice not found." };
  if (!["sent", "viewed", "partially_paid"].includes(doc.status)) return { error: "Only unpaid invoices that have been sent need a reminder." };
  if (!looksLikeEmail(doc.customer_email)) return { error: "There's no email for this customer. Remind them on WhatsApp instead." };
  const { reminderText, todayIso } = await import("@/lib/collect-core");
  return sendNow(id, {
    to: doc.customer_email,
    subject: `Reminder: invoice ${doc.number} from ${ctx.business.name}`,
    // the email has its own "View and pay" button, so the text leaves the link out
    message: reminderText(doc, ctx.business.name, "", todayIso()),
    includePdf: true,
  });
}
