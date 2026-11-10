import "server-only";
import { documentModel, receiptModel } from "@/lib/pdf-response";
import { renderPdf } from "@/lib/pdf";
import { createSupabaseService } from "@/lib/supabase/server";
import { paysOnline } from "@/lib/documents";

// What makes a customer email feel like the business's own: the document
// itself, as a PDF in the template and paper the business picked (the same
// file as "Download PDF"), and the email's colour taken from that template.
// Never throws: if the PDF can't be made, the email still goes with its links.

// the template's accent, unless it's a highlighter (Notebook) that would be too
// pale for a button; then the business's brand colour
export function emailColor(model, business) {
  if (!model) return business?.brand_color || null;
  if (model.template === "notebook") return business?.brand_color || null;
  return model.accent || business?.brand_color || null;
}

async function asAttachment(model, filename) {
  const bytes = await renderPdf(model);
  return { filename, content: Buffer.from(bytes), contentType: "application/pdf" };
}

// doc: a full documents row (select "*"). client: the team's or the service client.
// pdf: false when the business chose not to attach it; the document still shows in the email
export async function documentForEmail(client, doc, business, { pdf = true } = {}) {
  let model = null;
  // bank transfer only? then the email doesn't promise "pay online"
  const payOnline = await paysOnline(createSupabaseService(), doc.business_id).catch(() => true);
  try {
    model = await documentModel(client, doc);
    return { model, payOnline, attachment: pdf ? await asAttachment(model, `${doc.number}.pdf`) : null, color: emailColor(model, business), template: model.template };
  } catch (e) {
    console.error("email.document_pdf_failed", { doc: doc?.id, message: String(e?.message || e).slice(0, 200) });
    return { model, payOnline, attachment: null, color: model ? emailColor(model, business) : business?.brand_color || null };
  }
}

// receipt: a full receipts row; uses the business's receipt template
export async function receiptForEmail(client, receipt, business) {
  let model = null;
  try {
    ({ model } = await receiptModel(client, receipt));
    return { model, attachment: await asAttachment(model, `${receipt.number}.pdf`), color: emailColor(model, business), template: model.template };
  } catch (e) {
    console.error("email.receipt_pdf_failed", { receipt: receipt?.id, message: String(e?.message || e).slice(0, 200) });
    return { model, attachment: null, color: model ? emailColor(model, business) : business?.brand_color || null };
  }
}

// the email with the PDF attached, plus the same email worded without it for
// when the provider won't take the file (sendEmail's ifNotAttached). model: the
// document itself, shown in the email body (lib/email-docview.js)
// payOnline: false when the business takes bank transfer only
export function withDocument(build, { attachment, color, model = null, payOnline = true }) {
  const plain = build({ color, attached: false, model, payOnline });
  if (!attachment) return plain;
  const { subject, html, text } = plain;
  return { ...build({ color, attached: true, model, payOnline }), attachments: [attachment], ifNotAttached: { subject, html, text } };
}
