"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError, requireBusiness } from "@/lib/context";
import { cleanPayload, getDocument } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { emailConfigured, sendEmail } from "@/lib/email";
import { documentEmail, receiptEmail } from "@/lib/emails";
import { formatMoney, toMinor } from "@/lib/money";
import { formatDate } from "@/lib/format";
import { logoUrl, absoluteLogoUrl, siteUrl } from "@/lib/site";
import { emailDocument, sendDocumentInternal } from "@/lib/document-send";

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
  // postcodes are checked with NIPOST here (the key stays on the server)
  const { postcodeFields } = await import("@/lib/postcode-server");
  if (payload.customer?.postcode) {
    const pc = await postcodeFields(payload.customer.postcode);
    if (pc.error) return { error: `Customer postcode: ${pc.error}` };
    Object.assign(payload.customer, { postcode: pc.fields.postcode, postcode_area: pc.fields.postcode_area, postcode_verified: Boolean(pc.verified) });
  }
  if (payload.delivery?.postcode) {
    const pc = await postcodeFields(payload.delivery.postcode);
    if (pc.error) return { error: `Delivery postcode: ${pc.error}` };
    Object.assign(payload.delivery, { postcode: pc.fields.postcode, postcode_area: pc.fields.postcode_area });
  }
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

export async function sendDocument(id, { email = true, expected } = {}) {
  const ctx = await requireBusiness();
  if (!can(ctx.member, "documents.send") && !(ctx.member.role === "junior_finance" && !ctx.business.require_approval)) {
    return { error: "A manager or finance officer needs to approve and send this." };
  }
  const result = await sendDocumentInternal(ctx, id, { email, expected });
  refresh(id);
  if (result.error) return result;
  if (email && !(await emailConfigured())) return { message: "Marked as sent. Email isn't set up on this Usetally, so copy the link or share it on WhatsApp." };
  return { message: result.message || (result.emailed ? "Sent to your customer by email." : "Marked as sent. Share the link with your customer.") };
}

export async function resendEmail(id) {
  const ctx = await requireBusiness();
  const full = await getDocument(ctx, id);
  if (!full) return { error: "Document not found." };
  if (!full.doc.sent_at || ["draft", "pending_approval", "void"].includes(full.doc.status)) return { error: "Only sent documents can be emailed." };
  if (!can(ctx.member, "documents.send") && !(ctx.member.role === "junior_finance" && !ctx.business.require_approval)) return { error: "A manager or finance officer needs to send this." };
  if (!full.doc.customer_email) return { error: "Add an email for this customer first." };
  if (!(await emailConfigured())) return { error: "Email isn't set up on this Usetally. Share the link instead." };
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
    discount_minor: doc.discount_minor, tax_rate: doc.tax_rate, tax_label: doc.tax_label, prices_include_vat: Boolean(doc.prices_include_vat), notes: doc.notes, terms: doc.terms,
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
  const wht = form.wht ? toMinor(form.wht) : 0;
  if (!Number.isFinite(wht) || wht < 0) return { error: "Check the WHT amount." };
  if (!Number.isFinite(amount) || amount < 0 || (amount <= 0 && wht <= 0)) return { error: "Enter the amount you received." };
  const common = { doc_id: id, pay_method: String(form.method || "bank_transfer"), pay_reference: String(form.reference || "").slice(0, 120), pay_note: String(form.note || "").slice(0, 500), pay_date: form.date || null };
  const { error } = wht > 0
    ? await ctx.supabase.rpc("record_payment_with_wht", { ...common, cash_amount: amount, wht_amount: wht })
    : await ctx.supabase.rpc("record_manual_payment", { ...common, pay_amount: amount });
  refresh(id);
  if (error && /record_payment_with_wht/.test(error.message || "")) return { error: "Recording WHT needs a database update. Run RUN_NEW_2026-10-26d.sql in Supabase, then try again." };
  return error ? { error: friendlyError(error) } : { message: wht > 0 ? "Payment and WHT recorded. Receipt issued." : "Payment recorded and receipt issued." };
}

export async function emailReceipt(receiptId) {
  const ctx = await requireBusiness();
  const { data: receipt } = await ctx.supabase.from("receipts").select("*, documents(number, customer_email, customer_name)").eq("id", receiptId).eq("business_id", ctx.business.id).maybeSingle();
  if (!receipt) return { error: "Receipt not found." };
  if (!receipt.documents?.customer_email) return { error: "This customer has no email address." };
  if (!(await emailConfigured())) return { error: "Email isn't set up on this Usetally. Copy the receipt link instead." };
  const b = ctx.business;
  const link = `${siteUrl()}/r/${receipt.access_token}`;
  const r = await sendEmail({
    to: receipt.documents.customer_email, fromName: b.name, replyTo: b.email || undefined,
    ...receiptEmail({ business: b, logo: absoluteLogoUrl(b.logo_path), receipt, documentNumber: receipt.documents.number, link }),
  });
  return r.sent ? { message: "Receipt emailed." } : { error: "The email could not be sent." };
}

// template, paper, visible sections and payment instructions for one document;
// optionally also saved as the business default for that document type
export async function saveDocumentLayout(id, input, { asDefault = false } = {}) {
  const ctx = await requireBusiness();
  const { fits, cleanLayout } = await import("@/lib/doc-templates");
  const { data: doc } = await ctx.supabase.from("documents").select("id, kind, status").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!doc) return { error: "Document not found." };
  if (!fits(doc.kind, input.template, input.paper)) return { error: "That template isn't available for this paper size." };
  const { TEMPLATES } = await import("@/lib/doc-templates");
  const { readyTemplates, SQL_FOR } = await import("@/lib/templates-ready");
  const update = TEMPLATES[input.template]?.needsUpdate;
  if (update && !(await readyTemplates(ctx.supabase)).includes(input.template)) return { error: `This template needs a quick database update first. Run ${SQL_FOR[update]} in Supabase, then try again.` };
  const layout = cleanLayout(input.layout);
  const { error } = await ctx.supabase.rpc("set_document_layout", {
    doc_id: id, tpl: input.template, paper_size: input.paper, new_layout: layout, instructions: String(input.payment_instructions || "").slice(0, 2000),
  });
  if (error) return { error: friendlyError(error) };
  if (asDefault) {
    if (!can(ctx.member, "settings.business")) return { error: "Saved for this document. Only owners and managers can change the defaults." };
    const prefs = { ...(ctx.business.document_prefs || {}), [doc.kind]: { template: input.template, paper: input.paper, layout } };
    const { error: e } = await ctx.supabase.from("businesses").update({ document_prefs: prefs }).eq("id", ctx.business.id);
    if (e) return { error: "Saved for this document, but the default couldn't be saved." };
  }
  refresh(id);
  return { message: asDefault ? "Saved, and set as your default." : "Layout saved." };
}

// "I've sent it" from the customer: the money arrived (records the payment and
// issues the receipt), or it didn't (the customer sees why on their link)
export async function confirmPaymentClaim(claimId, amount) {
  const ctx = await requireBusiness();
  if (!can(ctx.member, "payments.record")) return { error: "Only owners, managers and finance officers can confirm payments." };
  const minor = amount == null || amount === "" ? null : toMinor(amount);
  if (minor !== null && (!Number.isFinite(minor) || minor <= 0)) return { error: "Enter the amount that arrived." };
  const { data: claim } = await ctx.supabase.from("payment_claims").select("id, document_id").eq("id", claimId).eq("business_id", ctx.business.id).maybeSingle();
  if (!claim) return { error: "That payment wasn't found." };
  const { error } = await ctx.supabase.rpc("confirm_payment_claim", { claim_id: claimId, confirm_amount: minor });
  refresh(claim.document_id);
  if (error) return { error: friendlyError(error) };
  // email the receipt when we can
  const { data: receipt } = await ctx.supabase.from("receipts").select("id, payment_id").eq("document_id", claim.document_id).order("issued_at", { ascending: false }).limit(1).maybeSingle();
  if (receipt && (await emailConfigured())) {
    const r = await emailReceipt(receipt.id).catch(() => null);
    if (r?.message) return { message: "Payment confirmed. The receipt was emailed to your customer." };
  }
  return { message: "Payment confirmed and receipt issued." };
}

export async function rejectPaymentClaim(claimId, reason) {
  const ctx = await requireBusiness();
  if (!can(ctx.member, "payments.record")) return { error: "Only owners, managers and finance officers can do this." };
  const { data: claim } = await ctx.supabase.from("payment_claims").select("id, document_id").eq("id", claimId).eq("business_id", ctx.business.id).maybeSingle();
  if (!claim) return { error: "That payment wasn't found." };
  const { error } = await ctx.supabase.rpc("reject_payment_claim", { claim_id: claimId, why: String(reason || "").slice(0, 500) });
  refresh(claim.document_id);
  return error ? { error: friendlyError(error) } : { message: "Marked as not received. Your customer can see your note on their link." };
}
