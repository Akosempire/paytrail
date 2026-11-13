// WhatsApp to invoice: the small, pure pieces (no database, no network), so
// they can be tested on their own. Phone numbers, Twilio's signature, link
// codes, amounts and item lines typed in a chat, and message splitting.
import { createHmac, timingSafeEqual } from "node:crypto";

// country calling codes for the countries Usetally offers (business.country holds the name)
const DIAL = {
  Nigeria: "234", Ghana: "233", Kenya: "254", "South Africa": "27", "Côte d'Ivoire": "225", Senegal: "221", Benin: "229", Togo: "228",
  Cameroon: "237", Rwanda: "250", Uganda: "256", Tanzania: "255", Egypt: "20", "United Arab Emirates": "971", "United Kingdom": "44",
  "United States": "1", Canada: "1", Ireland: "353", Germany: "49", France: "33", Netherlands: "31", India: "91",
};
export const dialCode = (country) => DIAL[String(country || "").trim()] || "234";

// any way people write a number → digits with the country code (2348012345678), or "" if it can't be a phone
// "whatsapp:+2348012345678", "+234 801 234 5678", "0801 234 5678", "2348012345678"
export function normPhone(raw, country = "Nigeria") {
  let s = String(raw || "").trim().replace(/^whatsapp:/i, "");
  const plus = s.startsWith("+") || s.startsWith("00");
  let d = s.replace(/\D/g, "");
  if (s.startsWith("00")) d = d.slice(2);
  if (!plus && d.startsWith("0")) d = dialCode(country) + d.replace(/^0+/, "");
  else if (!plus && d.length <= 10 && d.length >= 7) d = dialCode(country) + d; // a local number typed without its 0
  return /^[1-9]\d{7,14}$/.test(d) ? d : "";
}
export const waAddress = (digits) => `whatsapp:+${digits}`;
export const prettyPhone = (digits) => (digits ? `+${digits}` : "");

// a wa.me link that opens WhatsApp on the person's own phone with the message typed in
export const waShareLink = (digits, text) => `https://wa.me/${digits || ""}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

// ---------------------------------------------------------------- Twilio's signature
// Twilio signs each webhook: HMAC-SHA1 (auth token) of the full URL followed by
// every POST field name and value, sorted by name, then base64.
// https://www.twilio.com/docs/usage/webhooks/webhooks-security
export function twilioSignature(authToken, url, params = {}) {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + (params[k] ?? ""), String(url));
  return createHmac("sha1", String(authToken)).update(Buffer.from(data, "utf8")).digest("base64");
}
export function verifyTwilioSignature(authToken, url, params, signature) {
  if (!authToken || !signature) return false;
  const want = Buffer.from(twilioSignature(authToken, url, params));
  const got = Buffer.from(String(signature));
  return want.length === got.length && timingSafeEqual(want, got);
}

// ---------------------------------------------------------------- link codes
// 6 characters people can read out and type: no 0/O or 1/I/L
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LINK_MINUTES = 10;
export function makeCode(randomInt) {
  let c = "";
  for (let i = 0; i < 6; i++) c += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return c;
}
// "LINK K7Q2MX", "link k7q2mx", "K7Q2MX" (the open-WhatsApp button types the first)
export function parseLinkCode(text) {
  const m = String(text || "").trim().toUpperCase().match(/^(?:LINK\s*[:\-]?\s*)?([A-Z0-9]{6})[.!]?$/);
  if (!m) return null;
  const code = m[1];
  return [...code].every((ch) => CODE_ALPHABET.includes(ch)) && /\d/.test(code) ? code : null;
}

// ---------------------------------------------------------------- short answers
const norm = (t) => String(t || "").trim().toLowerCase().replace(/[.!👍✅]+$/u, "").trim();
export const isYes = (t) => /^(y|yes|yeah|yep|yes please|ok|okay|confirm|go|go ahead|send|send it|do it|sure|correct|1)$/.test(norm(t)) || /^👍|^✅/u.test(String(t || "").trim());
export const isNo = (t) => /^(n|no|nope|cancel|stop|don'?t|no thanks|2)$/.test(norm(t));
export const isMenu = (t) => /^(menu|hi|hello|hey|start|help|options|good (morning|afternoon|evening))$/.test(norm(t));
export const isCancel = (t) => /^(cancel|stop|exit|quit|0|back)$/.test(norm(t));

// ---------------------------------------------------------------- amounts and items
// "150000", "150,000", "₦150k", "1.5m", "N 20,000.50" → 150000 (a normal amount, not kobo); null if not an amount
export function parseAmount(raw) {
  const s = String(raw ?? "").trim().toLowerCase().replace(/^(ngn|n|₦|\$|£|€|ghs|kes|zar)\s*/, "").replace(/[,\s]/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1e3 : m[2] === "m" ? 1e6 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

// one item per line (or separated by ";"):
//   "Logo design 150000"   "Logo design - 150k"   "2 x Chairs @ 5000"   "3 chairs 5,000 each"   "Chairs x2 5000"
// → [{ description, quantity, unit_price }], plus lines it couldn't read
export function parseItems(text) {
  const items = [], bad = [];
  for (const raw of String(text || "").split(/\n|;/)) {
    let line = raw.trim().replace(/^[-•*\d]+[.)]\s+/, "").trim();
    if (!line) continue;
    line = line.replace(/\s+each$/i, "").replace(/\s+(per|\/)\s*(one|unit|piece|pc)$/i, "");
    const m = line.match(/^(.*?\S)[\s:=\-–@]+((?:ngn|₦|\$|£|€|n(?=\d))?\s*\d[\d,]*(?:\.\d+)?\s*[km]?)$/i);
    const price = m ? parseAmount(m[2]) : null;
    if (!m || price == null || !m[1].trim()) { bad.push(raw.trim()); continue; }
    let desc = m[1].trim().replace(/[\s:=\-–@]+$/, "");
    let quantity = 1;
    const q1 = desc.match(/^(\d+(?:\.\d+)?)\s*(?:x|×|pcs?|pieces?|units?)?\s+(.+)$/i);   // "2 x Chairs", "3 chairs"
    const q2 = desc.match(/^(.+?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)$/i);                        // "Chairs x2"
    if (q1 && Number(q1[1]) > 0 && !/^\d+$/.test(q1[2])) { quantity = Number(q1[1]); desc = q1[2]; }
    else if (q2 && Number(q2[2]) > 0) { quantity = Number(q2[2]); desc = q2[1]; }
    desc = desc.replace(/\s*@$/, "").trim();
    if (!desc) { bad.push(raw.trim()); continue; }
    items.push({ description: desc.slice(0, 300), quantity, unit_price: price });
  }
  return { items, bad };
}

// "INV-0042", "inv 42", "qt-7" → the document reference as typed, cleaned; null if none
export function parseDocRef(text) {
  const m = String(text || "").toUpperCase().match(/\b((?:INV|QT|QUO|RCT)[-\s]?\d{1,8})\b/);
  return m ? m[1].replace(/\s/, "-") : null;
}

// Twilio's limit for one WhatsApp message is 1,600 characters: split long replies on line breaks
export function splitMessage(text, max = 1500) {
  const out = [];
  let cur = "";
  for (const line of String(text || "").split("\n")) {
    const add = cur ? `${cur}\n${line}` : line;
    if (add.length <= max) { cur = add; continue; }
    if (cur) out.push(cur);
    cur = line.length > max ? line.slice(0, max) : line;
  }
  if (cur.trim()) out.push(cur);
  return out.length ? out : [""];
}

// WhatsApp formatting: *bold*. Markdown **bold** and headings from an AI are tidied.
export const toWhatsapp = (s) => String(s || "").replace(/\*\*(.+?)\*\*/g, "*$1*").replace(/^#{1,6}\s+/gm, "").replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1: $2").trim();

// variables for the approved customer templates (see Admin → Integrations → WhatsApp)
export function templateVars({ customer, business, label, amount, token }) {
  const clip = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
  return { 1: clip(customer, 60) || "there", 2: clip(business, 80), 3: clip(label, 60), 4: clip(amount, 40), 5: String(token || "") };
}

export const MENU = [
  "What would you like to do? Reply with a number, or just tell me in your own words.",
  "",
  "1. New invoice",
  "2. New quote",
  "3. Who owes me",
  "4. Mark an invoice paid",
  "5. Send a quote or invoice",
  "6. Turn a quote into an invoice",
  "",
  "Reply *menu* any time to see this again, or *cancel* to stop what you're doing.",
].join("\n");
