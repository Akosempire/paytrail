import "server-only";
import { documentModel, receiptModel } from "@/lib/pdf-response";
import { renderPdf } from "@/lib/pdf";

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
export async function documentForEmail(client, doc, business) {
  try {
    const model = await documentModel(client, doc);
    return { attachment: await asAttachment(model, `${doc.number}.pdf`), color: emailColor(model, business), template: model.template };
  } catch (e) {
    console.error("email.document_pdf_failed", { doc: doc?.id, message: String(e?.message || e).slice(0, 200) });
    return { attachment: null, color: business?.brand_color || null };
  }
}

// receipt: a full receipts row; uses the business's receipt template
export async function receiptForEmail(client, receipt, business) {
  try {
    const { model } = await receiptModel(client, receipt);
    return { attachment: await asAttachment(model, `${receipt.number}.pdf`), color: emailColor(model, business), template: model.template };
  } catch (e) {
    console.error("email.receipt_pdf_failed", { receipt: receipt?.id, message: String(e?.message || e).slice(0, 200) });
    return { attachment: null, color: business?.brand_color || null };
  }
}

// the email with the PDF attached, plus the same email worded without it for
// when the provider won't take the file (sendEmail's ifNotAttached)
export function withDocument(build, { attachment, color }) {
  const plain = build({ color, attached: false });
  if (!attachment) return plain;
  const { subject, html, text } = plain;
  return { ...build({ color, attached: true }), attachments: [attachment], ifNotAttached: { subject, html, text } };
}
