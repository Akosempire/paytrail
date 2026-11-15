// Reading a pasted customer message with AI: the instructions, and checking
// what comes back. Pure (no network), so it's tested; the call itself is in
// lib/whatsapp/ai.js (askJson) and the server action in app/app/documents.

export const PASTE_AI_MAX = 6000; // characters sent to the AI

export function pasteAiPrompt(currency = "NGN") {
  return `You read a message a small business received (WhatsApp, SMS, email or notes) and pull out only what should be charged on an invoice. Messages are often chatty and mix in news, greetings and payment details: think like the business owner and keep only the money being asked for and what it is for.
Reply with JSON only, no other text, in exactly this shape:
{"items":[{"description":"","quantity":1,"unit_price":null}],"customer":{"name":"","phone":"","email":""},"notes":""}
Rules:
- An item is anything being bought, ordered or charged for: goods, services, fees, delivery, dues, contributions, levies. Describe it by what the money is for, short and clear: "Rice 50kg", "Delivery", "Contribution: office internet subscription".
- quantity is a number (default 1). Sizes and units that describe the product (50kg, 5L, size 42) stay in the description.
- unit_price is the amount for ONE, as a plain number in ${currency} (45k = 45000, 1.2m = 1200000, "₦12,500" = 12500, "1,500 naira" = 1500). "1,500 each" or "1,500 per person" means unit_price 1500. If only a line total is given ("3 bags = 16,500"), divide by the quantity. "12 months at 5,000 monthly" means quantity 12, unit_price 5000.
- Use null only when the message truly gives no amount for that item. Never invent an amount.
- Account numbers, phone numbers, dates, times, room numbers and reference codes are NEVER prices.
- Leave out greetings, news, meeting notices, thanks, sign-offs, bank or wallet details, and grand totals of the whole order.
- customer: the buyer's name, phone and email only if clearly given (e.g. a signature); otherwise empty strings. The person asking to be paid is not the customer.
- notes: payment deadlines or terms worth keeping on the invoice ("Pay before Friday", "50% upfront"), otherwise "".
Examples:
Message: "Pls send 2 cartons of Indomie and 1 bag of sugar. Indomie 7,500 per carton, sugar 38k. Deliver to Ikeja. Thanks, Bola 08031234567"
JSON: {"items":[{"description":"Indomie (carton)","quantity":2,"unit_price":7500},{"description":"Sugar (bag)","quantity":1,"unit_price":38000}],"customer":{"name":"Bola","phone":"08031234567","email":""},"notes":""}
Message: "Hello all, the estate is collecting 5,000 each for the security levy this month. Pay to GTB 0123456789 by Monday. Also the meeting is on Saturday 4pm."
JSON: {"items":[{"description":"Security levy","quantity":1,"unit_price":5000}],"customer":{"name":"","phone":"","email":""},"notes":"Pay by Monday"}`;
}

// amounts written as money in the message: "1,500 naira", "₦12,000", "45k", "N 3,000", "5,000 each".
// Long digit runs (account and phone numbers), times and dates are not money.
export function moneyIn(text) {
  const out = [];
  const t = String(text || "");
  const re = /(?:₦|\bngn\s*|\bn(?=\s?\d))\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\b|\b(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\s*(?:naira|ngn|each|per (?:person|head|one|unit|piece|bag|carton))\b|\b(\d{1,3}(?:\.\d+)?)(k|m)\b/gi;
  for (const m of t.matchAll(re)) {
    const digits = m[1] || m[3] || m[6];
    const suffix = (m[2] || m[4] || m[7] || "").toLowerCase();
    if (!digits || digits.replace(/\D/g, "").length >= 9) continue;
    const v = Number(digits.replace(/,/g, "")) * (suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : 1);
    if (v > 0 && !out.includes(v)) out.push(v);
  }
  return out;
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
export function readPasteAi(reply, message = "") {
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
  // safety net for small models: one unpriced item and exactly one amount in the message → that's its price
  const unpriced = items.filter((i) => i.price == null);
  const amounts = moneyIn(message).filter((v) => !items.some((i) => i.price === v));
  if (unpriced.length === 1 && amounts.length === 1 && items.length === 1) unpriced[0].price = amounts[0];
  const c = data?.customer || {};
  const email = str(c.email, 200).toLowerCase();
  const phone = str(c.phone, 40).replace(/[^\d+\s()-]/g, "");
  return {
    items,
    customer: { name: str(c.name, 120), phone: /\d{7,}/.test(phone.replace(/\D/g, "")) ? phone : "", email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "" },
    notes: str(data?.notes, 500),
  };
}
