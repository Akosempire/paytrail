// Turns a list a customer sent (WhatsApp, SMS, email, notes) into invoice
// items. Each line becomes one item with a quantity and a price when it can
// find them; anything it can't read stays in the description for you to fix.
//
//   "2 x Rice 50kg - 45,000"       → Rice 50kg · 2 × 45,000
//   "Indomie carton ×5 @ 7.5k"     → Indomie carton · 5 × 7,500
//   "3 bags of cement = 16,500"    → Bags of cement · 3 × 5,500 (line total)
//   "1. Website design – 150k"     → Website design · 1 × 150,000
//   "[27/10/2026, 08:57] Chioma: Shoes size 42 ₦25,000"  → chat prefix removed
//
// mode: how to read a price with no "each"/"@"/"=" next to it: "each" (the
// default) or "total" (the price is for the whole line).

const WA_PREFIX = /^\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?\]?\s*(?:-\s*)?(?:[^:\n]{1,40}:\s+)?/i;
const BULLET = /^(?:\d{1,3}[.)]\s+|[-–—•*·▪►➤→✓✔✅👉🔹🔸☑️]+\s*)/u;
const CHATTER = /^(hi|hello|hey|good\s+(morning|afternoon|evening|day)|pls|please|kindly|thanks|thank\s*you|i\s+(need|want|would\s+like)|my\s+order|order(\s+list)?|here('|’)?s|list|total|sub\s*total|grand\s*total|delivery\s+(to|address)|address|send|account)\b/i;
const MONEY = "(?:₦|NGN|N(?=\\d)|\\$|USD|£|GBP|€|EUR|GH₵|KES|KSh)?\\s?\\d[\\d,]*(?:\\.\\d+)?\\s?(?:k|m)?\\b";
const MARKED_EACH = new RegExp(`(?:@|\\bat\\b|\\beach\\b|\\bper\\b|\\bea\\.?\\b|\\bunit\\b)\\s*:?\\s*(${MONEY})|(${MONEY})\\s*(?:each|per\\s+\\w+|ea\\.?|/\\s*\\w+)`, "i");
const MARKED_TOTAL = new RegExp(`(?:=|\\btotal\\b|\\bfor\\s+all\\b)\\s*:?\\s*(${MONEY})`, "i");
const SYMBOL_OR_SUFFIX = /(?:₦|NGN|N(?=\d)|\$|USD|£|GBP|€|EUR|GH₵|KES|KSh)\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m)?\b|\b\d[\d,]*(?:\.\d+)?\s?(?:k|m)\b/gi;
const PLAIN_PRICE = /\b(?:\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d{3,9}(?:\.\d+)?)\b/g;

// "₦45,000" → 45000, "7.5k" → 7500, "1.2m" → 1200000
export function readAmount(token) {
  const s = String(token || "").replace(/[₦$£€]|NGN|USD|GBP|EUR|GH₵|KES|KSh|\s/gi, "").replace(/^N(?=\d)/i, "");
  const m = s.match(/^(\d[\d,]*(?:\.\d+)?)([km])?$/i);
  if (!m) return null;
  let n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  if (/k/i.test(m[2] || "")) n *= 1000;
  if (/m/i.test(m[2] || "")) n *= 1_000_000;
  return Math.round(n * 100) / 100;
}

const tidy = (s) => s
  .replace(/\s*[-–—:=@,|]+\s*$/g, "").replace(/^\s*[-–—:=@,|]+\s*/g, "")
  .replace(/\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function parseLine(raw, { mode = "each" } = {}) {
  let line = String(raw || "").replace(/‎|‏|‪|‬/g, "").trim();
  line = line.replace(WA_PREFIX, "").replace(BULLET, "").replace(/[*_~]/g, "").trim();
  if (!line) return null;
  const hasDigit = /\d/.test(line);
  if (CHATTER.test(line) && (!hasDigit || /^(sub\s*|grand\s*)?total\b/i.test(line))) return null;

  let qty = null, price = null, total = null, rest = ` ${line} `;
  const take = (re) => { const m = rest.match(re); if (m) rest = rest.replace(m[0], " "); return m; };

  // quantity: "x2", "×2", "2x", "2 x", "qty 2", "(2)", or a small number at the start ("3 bags of…")
  let m = take(/\s[x×*]\s?(\d+(?:\.\d+)?)(?=\s|$|[,.;:)-])/i) || take(/\s(\d+(?:\.\d+)?)\s?[x×*](?=\s)/i) || take(/\bqty\.?\s*:?\s*(\d+(?:\.\d+)?)\b/i) || take(/\s\((\d{1,4})\)\s/);
  if (m) qty = Number(m[1]);

  // price: "@ 7,500" / "7,500 each" (unit), "= 16,500" / "total 16,500" (line), then ₦/k/m amounts, then the last plain number
  if ((m = take(MARKED_EACH))) price = readAmount(m[1] || m[2]);
  else if ((m = take(MARKED_TOTAL))) total = readAmount(m[1]);
  else {
    const marked = [...rest.matchAll(SYMBOL_OR_SUFFIX)].filter((x) => readAmount(x[0]) != null);
    const plain = [...rest.matchAll(PLAIN_PRICE)].filter((x) => !/^0\d{9,}/.test(x[0]) && x[0].replace(/\D/g, "").length < 10);
    const pick = marked.length ? marked[marked.length - 1] : plain.length && (plain.length > 1 || qty != null || /\D\s*$/.test(rest.slice(0, plain[plain.length - 1].index)) ) ? plain[plain.length - 1] : null;
    if (pick) {
      rest = rest.slice(0, pick.index) + " " + rest.slice(pick.index + pick[0].length);
      if (mode === "total") total = readAmount(pick[0]); else price = readAmount(pick[0]);
    }
  }
  if (qty == null && (m = rest.match(/^\s(\d{1,3})\s+(?=[a-z])/i))) { qty = Number(m[1]); rest = rest.replace(m[0], " "); }
  if (qty == null || !(qty > 0)) qty = 1;
  if (total != null && price == null) price = Math.round((total / qty) * 100) / 100;

  // "5 pcs Ankara" → "Ankara"; real units ("bags of cement") stay
  rest = rest.replace(/^\s*(?:pcs|pieces|piece|pc|units|unit|nos|no\.)\s+(?:of\s+)?/i, " ");
  const description = cap(tidy(rest.replace(/\s(?:of\s)?(?:for|at)\s*$/i, "")));
  if (!description) return null;
  return { description, quantity: qty, price };
}

export function parseItemList(text, opts) {
  return String(text || "").split(/\r?\n/).map((l) => parseLine(l, opts)).filter(Boolean).slice(0, 100);
}
