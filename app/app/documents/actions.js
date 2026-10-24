"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError, requireBusiness } from "@/lib/context";
import { cleanPayload, getDocument } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { brandedEmail, emailConfigured, sendEmail } from "@/lib/email";
import { formatMoney, toMinor } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { logoUrl, siteUrl } from "@/lib/site";

function refresh(id) {
  revalidatePath("/app", "layout");
  if (id) revalidatePath(`/app/documents/${id}`);
}

// intent: "draft" | "submit" | "send"
export async function saveDocument(docId, input, intent = "draft") {
  const ctx = await requireBusiness();
  const payload = cleanPayload(input);
  if (!payload.customer_id && !payload.customer?.name) return { error: "Choose a customer or add a new one." };
  if (!payload.items.length) return { error: "Add at least one item." };
  if (payload.items.some((i) => !i.description)) return { error: "Every item needs a description." };
  const { data: id, error } = await ctx.supabase.rpc("save_document", { target: ctx.business.id, doc_id: docId || null, payload });
  if (error) return { error: friendlyError(error) };
  if (intent === "submit") {
    const { error: e } = await ctx.supabase.rpc("submit_document", { doc_id: id });
    if (e) return { error: friendlyError(e), id };
  }
  if (intent === "send") {
    const sent = await sendDocumentInternal(ctx, id, { email: Boolean(input.email_customer) });
    if (sent.error) return { ...sent, id };
  }
  refresh(id);
  return { id };
}

async function sendDocumentInternal(ctx, id, { email, expected }) {
  const { error } = await ctx.supabase.rpc("mark_document_sent", { doc_id: id, expected_updated_at: expected || null });
  if (error) return { error: friendlyError(error) };
  if (!email) return { ok: true, emailed: false };
  const full = await getDocument(ctx, id);
  if (!full?.doc.customer_email) return { ok: true, emailed: false, message: "Marked as sent. This customer has no email, so share the link instead." };
  const result = await emailDocument(ctx, full);
  return { ok: true, emailed: result.sent };
}

async function emailDocument(ctx, { doc, link }) {
  const quote = doc.kind === "quote";
  const b = ctx.business;
  return sendEmail({
    to: doc.customer_email,
    replyTo: b.email || undefined,
    fromName: b.name,
    subject: `${quote ? "Quotation" : "Invoice"} ${doc.number} from ${b.name}`,
    html: brandedEmail({
      brandName: b.name, brandColor: b.brand_color, logo: logoUrl(b.logo_path),
      heading: quote ? `Your quotation from ${b.name}` : `Invoice ${doc.number} from ${b.name}`,
      lines: [
        `Hi ${doc.customer_name.split(" ")[0] || "there"},`,
        quote
          ? `Here is our quotation${doc.title ? ` for ${doc.title}` : ""} for ${formatMoney(doc.total_minor, doc.currency)}. You can review it, accept it and pay online from the link below.`
          : `Here is invoice ${doc.number} for ${formatMoney(doc.total_minor - doc.amount_paid_minor, doc.currency)}${doc.due_date ? `, due ${formatDate(doc.due_date)}` : ""}. You can view and pay it from the link below.`,
      ],
      buttonText: quote ? "View quotation" : "View & pay invoice",
      buttonUrl: link,
    }),
  });
}

export async function sendDocument(id, { email = true, expected } = {}) {
  const ctx = await requireBusiness();
  if (!can(ctx.member, "documents.send") && !(ctx.member.role === "junior_finance" && !ctx.business.require_approval)) {
    return { error: "A manager or finance officer needs to approve and send this." };
  }
  const result = await sendDocumentInternal(ctx, id, { email, expected });
  refresh(id);
  if (result.error) return result;
  if (email && !emailConfigured()) return { message: "Marked as sent. Email isn't set up on this PayTrail, so copy the link or share it on WhatsApp." };
  return { message: result.message || (result.emailed ? "Sent to your customer by email." : "Marked as sent. Share the link with your customer.") };
}

export async function resendEmail(id) {
  const ctx = await requireBusiness();
  const full = await getDocument(ctx, id);
  if (!full) return { error: "Document not found." };
  if (!full.doc.sent_at || ["draft", "pending_approval", "void"].includes(full.doc.status)) return { error: "Only sent documents can be emailed." };
  if (!can(ctx.member, "documents.send") && !(ctx.member.role === "junior_finance" && !ctx.business.require_approval)) return { error: "A manager or finance officer needs to send this." };
  if (!full.doc.customer_email) return { error: "Add an email for this customer first." };
  if (!emailConfigured()) return { error: "Email isn't set up on this PayTrail. Share the link instead." };
  const r = await emailDocument(ctx, full);
  return r.sent ? { message: `Emailed to ${full.doc.customer_email}.` } : { error: "The email could not be sent. Try again." };
}

export async function submitForApproval(id) {
  const ctx = await requireBusiness();
  const { error } = await ctx.supabase.rpc("submit_document", { doc_id: id });
  refresh(id);
  return error ? { error: friendlyError(error) } : { message: "Sent for approval." };
}

export async function returnToDraft(id, reason) {
  const ctx = await requireBusiness();
  const { error } = await ctx.supabase.rpc("return_document_to_draft", { doc_id: id, reason: String(reason || "").slice(0, 500) });
  refresh(id);
  return error ? { error: friendlyError(error) } : { message: "Returned to draft with your note." };
}

export async function voidDocument(id) {
  const ctx = await requireBusiness();
  const { error } = await ctx.supabase.rpc("void_document", { doc_id: id });
  refresh(id);
  return error ? { error: friendlyError(error) } : { message: "Document voided." };
}

export async function deleteDraft(id, kind) {
  const ctx = await requireBusiness();
  const { error } = await ctx.supabase.rpc("delete_draft", { doc_id: id });
  if (error) return { error: friendlyError(error) };
  refresh();
  redirect(kind === "invoice" ? "/app/invoices" : "/app/quotes");
}

export async function convertToInvoice(id) {
  const ctx = await requireBusiness();
  const { data, error } = await ctx.supabase.rpc("convert_quote_to_invoice", { quote_id: id });
  if (error) return { error: friendlyError(error) };
  refresh(id);
  redirect(`/app/documents/${data}?converted=1`);
}

export async function duplicateDocument(id, asKind) {
  const ctx = await requireBusiness();
  const full = await getDocument(ctx, id);
  if (!full) return { error: "Document not found." };
  const { doc, items, costs } = full;
  const payload = cleanPayload({
    kind: asKind || doc.kind, title: doc.title, customer_id: doc.customer_id || undefined,
    customer: doc.customer_id ? undefined : { name: doc.customer_name, company: doc.customer_company, email: doc.customer_email, phone: doc.customer_phone, address: doc.customer_address },
    discount_minor: doc.discount_minor, tax_rate: doc.tax_rate, tax_label: doc.tax_label, notes: doc.notes, terms: doc.terms,
    items, costs: costs || undefined,
  });
  delete payload.issue_date; delete payload.due_date; delete payload.valid_until;
  const { data: newId, error } = await ctx.supabase.rpc("save_document", { target: ctx.business.id, doc_id: null, payload });
  if (error) return { error: friendlyError(error) };
  refresh();
  redirect(`/app/documents/${newId}/edit`);
}

export async function recordPayment(id, form) {
  const ctx = await requireBusiness();
  const amount = toMinor(form.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount you received." };
  const { error } = await ctx.supabase.rpc("record_manual_payment", {
    doc_id: id, pay_method: String(form.method || "bank_transfer"), pay_reference: String(form.reference || "").slice(0, 120),
    pay_amount: amount, pay_note: String(form.note || "").slice(0, 500), pay_date: form.date || null,
  });
  refresh(id);
  return error ? { error: friendlyError(error) } : { message: "Payment recorded and receipt issued." };
}

export async function emailReceipt(receiptId) {
  const ctx = await requireBusiness();
  const { data: receipt } = await ctx.supabase.from("receipts").select("*, documents(number, customer_email, customer_name)").eq("id", receiptId).eq("business_id", ctx.business.id).maybeSingle();
  if (!receipt) return { error: "Receipt not found." };
  if (!receipt.documents?.customer_email) return { error: "This customer has no email address." };
  if (!emailConfigured()) return { error: "Email isn't set up on this PayTrail. Copy the receipt link instead." };
  const b = ctx.business;
  const link = `${siteUrl()}/r/${receipt.access_token}`;
  const r = await sendEmail({
    to: receipt.documents.customer_email, fromName: b.name, replyTo: b.email || undefined,
    subject: `Receipt ${receipt.number} from ${b.name}`,
    html: brandedEmail({ brandName: b.name, brandColor: b.brand_color, logo: logoUrl(b.logo_path), heading: "Thank you for your payment",
      lines: [`We received ${formatMoney(receipt.amount_minor, receipt.currency)} for ${receipt.documents.number}.`, "Your receipt is ready to view and download."],
      buttonText: "View receipt", buttonUrl: link }),
  });
  return r.sent ? { message: "Receipt emailed." } : { error: "The email could not be sent." };
}
