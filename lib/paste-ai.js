// Reading a pasted message with AI: the instructions, and checking what comes
// back against the message itself. Pure (no network), so it's tested; the AI
// calls are in lib/paste-ai-run.js.
//
// How it stays general rather than tuned to one message:
//  1. The model first writes what the message is about and lists EVERY number
//     in it with what that number is (price, total, already paid, account
//     number, date...). Deciding what each number means before building lines
//     is what makes small models get chatty messages right.
//  2. Our code then checks the answer against the message: every price must
//     come from a number that's really there, and money the model marked as a
//     price must end up on a line. Problems go back to the model once to fix.
//  3. Whatever still looks doubtful is flagged for the person to check.

export const PASTE_AI_MAX = 6000; // characters sent to the AI

export function pasteAiPrompt(currency = "NGN") {
  return `You help a small business turn a message into invoice lines. The message may be an order, a quote request, a group notice, an email thread or rough notes, and is often chatty.
Work like a careful bookkeeper:
1. understanding: one sentence saying who is asking whom for money, and for what.
2. numbers: list EVERY number in the message, with the exact words around it and what it is. kind is one of: "price" (amount for one), "line_total" (amount for several of something), "order_total", "budget" (what the customer will spend on the whole job), "already_paid", "deposit", "discount", "fee", "quantity", "account_or_phone", "date_or_time", "other". Keep each text to a few words.
3. items: one line per thing being charged for (goods, services, fees, delivery, dues, contributions, rent, levies...). description says what the money is for, short and clear. quantity defaults to 1. unit_price is the amount for ONE in ${currency} as a plain number (45k = 45000, 1.2m = 1200000). If only a line_total is given, unit_price = line_total / quantity. Every unit_price must come from a "price", "line_total" or "fee" number you listed. Use null only if the message gives no amount for that thing. Never invent amounts, and never use payments already made, account numbers, phone numbers, dates or times as prices.
   If the message gives ONE amount for the whole job (a budget or total) and no separate prices, make ONE line for the whole job priced at that amount (description like "Restaurant branding project"), and list what's included in its "details" (e.g. "Logo; menu design, 35 items, print and QR; 5 promotional flyers").
4. customer: the buyer's name, phone, email, only if the message clearly gives them; otherwise "". The person asking to be paid is the business, not the customer.
5. notes: deadlines or payment terms worth printing on the invoice, otherwise "".
Reply with JSON only, exactly this shape:
{"understanding":"","numbers":[{"text":"","value":0,"kind":""}],"items":[{"description":"","details":"","quantity":1,"unit_price":null}],"customer":{"name":"","phone":"","email":""},"notes":""}
Example message: "Hi Kemi, as discussed: 3 hours of photography at 25k per hour plus 2 printed albums, 40,000 for both. You already sent 30k on 2nd May, balance by Friday. Acct 0123456789. - Tunde"
Example JSON: {"understanding":"Tunde is billing Kemi for photography and albums, minus 30k already paid.","numbers":[{"text":"3 hours","value":3,"kind":"quantity"},{"text":"25k per hour","value":25000,"kind":"price"},{"text":"2 printed albums","value":2,"kind":"quantity"},{"text":"40,000 for both","value":40000,"kind":"line_total"},{"text":"sent 30k","value":30000,"kind":"already_paid"},{"text":"2nd May","value":2,"kind":"date_or_time"},{"text":"Acct 0123456789","value":123456789,"kind":"account_or_phone"}],"items":[{"description":"Photography (per hour)","quantity":3,"unit_price":25000},{"description":"Printed album","quantity":2,"unit_price":20000}],"customer":{"name":"Kemi","phone":"","email":""},"notes":"30,000 already paid; balance due by Friday"}`;
}

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const word = (n) => n.toLowerCase();

// every number in the message that could be money: not account or phone numbers
// (9+ digits), times (10:30, 4pm), dates (19th, 2nd May, 12/11), or years
export function numbersIn(text) {
  const t = String(text || "");
  const out = [];
  const re = /(₦|\bngn|\bn(?=\s?\d))?\s?(\d[\d,]*(?:\.\d+)?)\s*(k|m)?(?![\w:/])/gi;
  for (const m of t.matchAll(re)) {
    const raw = m[2], at = m.index ?? 0, after = t.slice(at + m[0].length, at + m[0].length + 12), before = t.slice(Math.max(0, at - 10), at);
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 9) continue;                                  // account / phone
    if (/^\s*(am|pm|hrs?\b|o'?clock)/i.test(after)) continue;         // time
    if (/\d[:/]$/.test(before) || /^[:/]\d/.test(after)) continue;       // 10:30, 12/11
    if (/^(st|nd|rd|th)\b/i.test(after)) continue;                     // 19th
    if (new RegExp(`^\\s*(?:of\\s+)?(${MONTHS})`, "i").test(after) || new RegExp(`(${MONTHS})[a-z]*\\.?\\s*$`, "i").test(before)) continue; // 2 May, May 2
    const v = Number(raw.replace(/,/g, "")) * (word(m[3] || "") === "k" ? 1e3 : word(m[3] || "") === "m" ? 1e6 : 1);
    if (!m[1] && !m[3] && /^(19|20)\d\d$/.test(raw)) continue;          // a year
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
const near = (a, b) => Math.abs(a - b) <= Math.max(0.01, Math.abs(b) * 0.005);
const PRICE_KINDS = ["price", "line_total", "fee"];
const WHOLE_JOB = ["order_total", "budget"];

// the model's reply → JSON object, or null
export function parseJson(reply) {
  const raw = String(reply || "").replace(/```(?:json)?/gi, "");
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const body = raw.slice(start, end + 1);
  try { return JSON.parse(body); } catch { /* try once more without trailing commas */ }
  try { return JSON.parse(body.replace(/,\s*([}\]])/g, "$1")); } catch { return null; }
}

// Checks the model's answer against the message.
// → { result: { understanding, items: [{ description, quantity, price, check? }], customer, notes }, problems: [text for the model] }
export function checkPasteAi(data, message = "") {
  if (!data || typeof data !== "object") return { result: null, problems: ["The reply wasn't the JSON asked for."] };
  const inMessage = numbersIn(message);
  const listed = (Array.isArray(data.numbers) ? data.numbers : []).map((n) => ({ text: str(n?.text, 80), value: num(n?.value), kind: str(n?.kind, 20) })).filter((n) => n.value != null);
  const problems = [];

  const items = (Array.isArray(data.items) ? data.items : []).slice(0, 100).map((i) => {
    const description = str(i?.description, 300);
    if (!description) return null;
    let quantity = num(i?.quantity);
    if (!(quantity > 0) || quantity > 1e6) quantity = 1;
    quantity = Math.round(quantity * 1000) / 1000;
    let price = num(i?.unit_price ?? i?.price);
    if (!(price >= 0) || price > 1e12) price = null;
    if (price != null) price = Math.round(price * 100) / 100;
    let check = "";
    if (price != null) {
      // the price (or price × quantity) must be a number that's really in the message
      const found = inMessage.some((v) => near(v, price) || near(v, price * quantity));
      if (!found) { check = "This amount isn't in the message"; problems.push(`"${description}" has unit_price ${price}, which isn't a number in the message.`); }
      const lone = (data.items || []).length === 1;
      const wrongKind = listed.find((n) => (near(n.value, price) || near(n.value, price * quantity)) && !PRICE_KINDS.includes(n.kind) && !(lone && WHOLE_JOB.includes(n.kind)) && !listed.some((x) => x !== n && PRICE_KINDS.includes(x.kind) && near(x.value, n.value)));
      if (found && wrongKind) { check = `This is the ${wrongKind.kind.replace(/_/g, " ")} in the message`; problems.push(`"${description}" uses ${price}, which you marked as ${wrongKind.kind}, not a price.`); }
    }
    const details = str(i?.details, 1000);
    return { description, quantity, price, ...(details ? { details } : {}), ...(check ? { check } : {}) };
  }).filter(Boolean);

  // money the model itself called a price, but that ended up on no line
  const used = (v) => items.some((i) => i.price != null && (near(i.price, v) || near(i.price * i.quantity, v)));
  const wholeJob = listed.filter((n) => WHOLE_JOB.includes(n.kind));
  const anyPrice = listed.some((n) => PRICE_KINDS.includes(n.kind));
  const unusedPrices = listed.filter((n) => (PRICE_KINDS.includes(n.kind) || (!anyPrice && wholeJob.length === 1 && n === wholeJob[0])) && !used(n.value));
  const unpriced = items.filter((i) => i.price == null);
  if (unusedPrices.length && (unpriced.length || !items.length)) problems.push(`You listed ${unusedPrices.map((n) => `"${n.text}"`).join(", ")} as prices but no line uses ${unusedPrices.length === 1 ? "it" : "them"}${unpriced.length ? `, while ${unpriced.map((i) => `"${i.description}"`).join(", ")} ${unpriced.length === 1 ? "has" : "have"} no price` : ""}.`);
  if (!items.length && !unusedPrices.length) problems.push("No lines were found.");

  const c = data.customer || {};
  const email = str(c.email, 200).toLowerCase();
  const phone = str(c.phone, 40).replace(/[^\d+\s()-]/g, "");
  return {
    result: items.length ? {
      understanding: str(data.understanding, 300),
      items,
      customer: { name: str(c.name, 120), phone: /\d{7,}/.test(phone.replace(/\D/g, "")) ? phone : "", email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "" },
      notes: str(data.notes, 500),
    } : null,
    problems,
  };
}

// a short note back to the model when its first answer doesn't add up
export const repairPrompt = (problems) => `Check your answer against the message again. Problems found:\n- ${problems.join("\n- ")}\nFix them and reply with the full corrected JSON only, in the same shape.`;

// last resort after the model has had its chance: a single unpriced line and a
// single money amount in the message → that's its price (flagged for checking)
export function fillLonePrice(result, message) {
  if (!result || result.items.length !== 1 || result.items[0].price != null) return result;
  const money = numbersIn(message);
  if (money.length !== 1) return result;
  return { ...result, items: [{ ...result.items[0], price: money[0], check: "Price taken from the message: check it" }] };
}

// kept for callers that only have the reply (older code paths)
export function readPasteAi(reply, message = "") {
  return fillLonePrice(checkPasteAi(parseJson(reply), message).result, message);
}
