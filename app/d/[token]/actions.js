"use server";
import { headers } from "next/headers";
import { createSupabaseService } from "@/lib/supabase/server";
import { getPublicDocument } from "@/lib/documents";
import { startCheckout, PROVIDERS } from "@/lib/payments";
import { randomUUID } from "node:crypto";
import { r2Delete, r2Put, r2Ready } from "@/lib/storage";
import { MAX_FILE_BYTES, cleanFileName, fileTypeOf, formatSize } from "@/lib/file-types";
import { toMinor } from "@/lib/money";

// tiny in-memory throttle per IP so a public link can't be hammered
const hits = new Map();
async function throttle(key, limit = 12) {
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const k = `${key}:${ip}`;
  const now = Date.now();
  const list = (hits.get(k) || []).filter((t) => now - t < 60000);
  list.push(now);
  hits.set(k, list);
  return list.length > limit;
}

export async function respondToQuote(token, { accept, name, reason }) {
  if (await throttle("respond")) return { error: "Too many attempts. Wait a minute and try again." };
  if (accept && !String(name || "").trim()) return { error: "Type your name to accept." };
  const service = createSupabaseService();
  const { error } = await service.rpc("customer_respond", { raw_token: token, accept: Boolean(accept), signer: String(name || "").slice(0, 120), reason: String(reason || "").slice(0, 500) });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function payDocument(token, provider) {
  if (await throttle("pay", 8)) return { error: "Too many attempts. Wait a minute and try again." };
  if (!PROVIDERS[provider]) return { error: "Choose a payment method." };
  const found = await getPublicDocument(token);
  if (!found) return { error: "This document could not be found." };
  const { doc, business, providers, invoice } = found;
  if (!providers.some((p) => p.provider === provider)) return { error: "That payment method is not available." };
  if (["void", "declined"].includes(doc.status)) return { error: "This document can't be paid." };
  if (business.subscription_status === "suspended") return { error: "Online payment is unavailable. Please contact the business." };
  // a quote is paid through its invoice once converted
  const target = invoice || doc;
  const balance = Number(target.total_minor) - Number(target.amount_paid_minor);
  if (balance <= 0) return { error: "This has already been paid." };
  if (doc.kind === "quote" && !invoice && ["sent", "viewed"].includes(doc.status)) {
    return { error: "Accept the quote first, then pay." };
  }
  try {
    const { url } = await startCheckout({
      businessId: doc.business_id, provider, purpose: "document", documentId: target.id || doc.id,
      amountMinor: balance, currency: doc.currency,
      customer: { email: doc.customer_email, name: doc.customer_company || doc.customer_name, phone: doc.customer_phone },
      brand: { name: business.name, logo: business.logo_path, description: `${doc.kind === "quote" ? "Quotation" : "Invoice"} ${doc.number}` },
    });
    return { url };
  } catch (e) {
    console.error("checkout.start_failed", { provider, message: e.message });
    await import("@/lib/monitor").then((m) => m.reportFailure("payments", `A customer couldn't start a ${PROVIDERS[provider].name} payment: ${e.message}`)).catch(() => {});
    return { error: `${PROVIDERS[provider].name} couldn't start the payment right now. Try again, or pay by bank transfer.` };
  }
}

// "I've sent it": the customer paid by bank transfer and tells the business,
// with an optional screenshot or PDF of the transfer. Nothing is recorded until
// someone on the team confirms the money arrived.
const PROOF = ["pdf", "png", "jpg", "jpeg", "webp", "heic"];
export async function claimPayment(token, form) {
  if (await throttle("claim", 5)) return { error: "Too many attempts. Wait a minute and try again." };
  const found = await getPublicDocument(token);
  if (!found) return { error: "This document could not be found." };
  const { doc, business, invoice } = found;
  const target = invoice || doc;
  const amount = toMinor(form.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount you sent." };
  const payer = (String(form.get("payer") || "").trim() || doc.customer_name || "Customer").slice(0, 120);
  const date = String(form.get("date") || "").slice(0, 10) || null;
  const note = String(form.get("note") || "").trim().slice(0, 500);
  const service = createSupabaseService();

  // the proof, kept privately with the document (only the team can open it)
  let fileId = null, key = null;
  const file = form.get("proof");
  if (file && typeof file !== "string" && file.size) {
    const type = fileTypeOf(file.name);
    if (!type || !PROOF.includes(file.name.split(".").pop().toLowerCase())) return { error: "Add a screenshot (photo) or a PDF of the transfer." };
    if (file.size > MAX_FILE_BYTES) return { error: `That file is ${formatSize(file.size)}. It can be up to 4 MB.` };
    if (await r2Ready()) {
      fileId = randomUUID(); key = `${doc.business_id}/docs/${target.id}/${fileId}.${type.ext}`;
      try {
        await r2Put(key, new Uint8Array(await file.arrayBuffer()), type.mime);
        const { error } = await service.from("document_files").insert({ id: fileId, business_id: doc.business_id, document_id: target.id, name: cleanFileName(`Transfer proof - ${file.name}`),
          content_type: type.mime, size_bytes: file.size, storage_key: key, uploaded_by: null, uploaded_by_name: `${payer} (customer)` });
        if (error) throw error;
      } catch (e) {
        console.error("claim.proof_failed", { message: e?.message });
        if (key) await r2Delete(key).catch(() => {});
        fileId = null; key = null;
      }
    }
  }

  const { error } = await service.rpc("submit_payment_claim", { raw_token: token, claim_amount: amount, claim_payer: payer, claim_date: date, claim_note: note, claim_file: fileId });
  if (error) {
    if (fileId) { await service.from("document_files").delete().eq("id", fileId); await r2Delete(key).catch(() => {}); }
    if (/payment_claims|submit_payment_claim/.test(error.message)) return { error: `${business.name} can't receive this yet. Send them your proof of payment directly.` };
    return { error: error.message };
  }

  // the team sees it on their dashboard now, and in the next morning's email
  return { ok: true, proofSaved: Boolean(fileId) || !(file && typeof file !== "string" && file.size) };
}
