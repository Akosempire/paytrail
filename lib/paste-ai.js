// Reading a pasted customer message with AI: the instructions, and checking
// what comes back. Pure (no network), so it's tested; the call itself is in
// lib/whatsapp/ai.js (askJson) and the server action in app/app/documents.

export const PASTE_AI_MAX = 6000; // characters sent to the AI

export function pasteAiPrompt(currency = "NGN") {
  return `You turn a message a customer sent a small business (WhatsApp, SMS, email or notes) into invoice lines.
Reply with JSON only, no other text, in exactly this shape:
{"items":[{"description":"","quantity":1,"unit_price":null}],"customer":{"name":"","phone":"","email":""},"notes":""}
Rules:
- One item per thing being bought or charged for (goods, services, delivery or other fees). Keep the customer's wording for the description, tidied: "Rice 50kg", "Groundnut oil 5L", "Delivery".
- quantity is a number (default 1). Units of measure that describe the product (50kg, 5L, size 42) stay in the description.
- unit_price is the price for ONE, as a plain number in ${currency} (45k = 45000, 1.2m = 1200000, "₦12,500" = 12500). If the message gives the total for the line ("3 bags = 16,500"), divide by the quantity. If a period is priced ("12 months at 5,000 monthly"), use quantity 12 and unit_price 5000. If no price is given, use null. Never invent a price.
- Leave out greetings, thanks, sign-offs, account numbers, addresses and totals or subtotals of the whole order.
- customer: the buyer's name, phone and email only if the message clearly gives them (e.g. a signature); otherwise empty strings.
- notes: payment terms or delivery instructions worth keeping on the invoice (e.g. "50% upfront"), otherwise "".`;
}

const num = (v) => {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).toLowerCase().replace(/[₦$£€,\s]|ngn|naira/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  return Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1);
};
const str = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// the model's reply (text that should hold JSON) → { items, customer, notes }, or null if unusable
export function readPasteAi(reply) {
  const raw = String(reply || "");
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let data;
  try { data = JSON.parse(raw.slice(start, end + 1)); } catch { return null; }
  const items = (Array.isArray(data?.items) ? data.items : []).slice(0, 100).map((i) => {
    const description = str(i?.description, 300);
    let quantity = num(i?.quantity);
    if (!(quantity > 0) || quantity > 1e6) quantity = 1;
    let price = num(i?.unit_price ?? i?.price);
    if (!(price >= 0) || price > 1e12) price = null;
    return description ? { description, quantity: Math.round(quantity * 1000) / 1000, price: price == null ? null : Math.round(price * 100) / 100 } : null;
  }).filter(Boolean);
  if (!items.length) return null;
  const c = data?.customer || {};
  const email = str(c.email, 200).toLowerCase();
  const phone = str(c.phone, 40).replace(/[^\d+\s()-]/g, "");
  return {
    items,
    customer: { name: str(c.name, 120), phone: /\d{7,}/.test(phone.replace(/\D/g, "")) ? phone : "", email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "" },
    notes: str(data?.notes, 500),
  };
}
