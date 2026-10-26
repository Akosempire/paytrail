import "server-only";
import { friendlyError } from "@/lib/context";
import { getDocument } from "@/lib/documents";
import { sendEmail } from "@/lib/email";
import { documentEmail } from "@/lib/emails";
import { absoluteLogoUrl } from "@/lib/site";

// marks a document sent and, if asked, emails the customer its link
export async function sendDocumentInternal(ctx, id, { email, expected } = {}) {
  const { error } = await ctx.supabase.rpc("mark_document_sent", { doc_id: id, expected_updated_at: expected || null });
  if (error) return { error: friendlyError(error) };
  if (!email) return { ok: true, emailed: false };
  const full = await getDocument(ctx, id);
  if (!full?.doc.customer_email) return { ok: true, emailed: false, message: "Marked as sent. This customer has no email, so share the link instead." };
  const result = await emailDocument(ctx, full);
  return { ok: true, emailed: result.sent };
}

export async function emailDocument(ctx, { doc, link }) {
  const b = ctx.business;
  return sendEmail({ to: doc.customer_email, replyTo: b.email || undefined, fromName: b.name, ...documentEmail({ business: b, logo: absoluteLogoUrl(b.logo_path), doc, link }) });
}
