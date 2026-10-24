"use server";
import { headers } from "next/headers";
import { createSupabaseService } from "@/lib/supabase/server";
import { getPublicDocument } from "@/lib/documents";
import { startCheckout, PROVIDERS } from "@/lib/payments";

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
    return { error: `${PROVIDERS[provider].name} couldn't start the payment right now. Try again, or pay by bank transfer.` };
  }
}
