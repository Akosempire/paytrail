// All amounts are stored in minor units (kobo, cents).
const SYMBOLS = { NGN: "₦", USD: "$", GBP: "£", EUR: "€", CAD: "CA$", AUD: "A$", GHS: "GH₵", KES: "KSh", ZAR: "R", XOF: "CFA", AED: "AED ", INR: "₹", SGD: "S$" };
export const CURRENCIES = Object.keys(SYMBOLS);

export function formatMoney(minor, currency = "NGN", { decimals } = {}) {
  const value = Number(minor || 0) / 100;
  const digits = decimals ?? (Number.isInteger(value) ? 0 : 2);
  const formatted = Math.abs(value).toLocaleString("en-NG", { minimumFractionDigits: digits, maximumFractionDigits: 2 });
  return `${value < 0 ? "-" : ""}${SYMBOLS[currency] ?? currency + " "}${formatted}`;
}

// "25,000.50" → 2500050. Returns NaN for anything that is not a plain amount.
export function toMinor(input) {
  const text = String(input ?? "").replace(/[,\s₦$£€]/g, "").trim();
  if (text === "") return 0;
  if (!/^\d+(\.\d{0,2})?$/.test(text)) return NaN;
  const [whole, fraction = ""] = text.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function minorToInput(minor) {
  const value = Number(minor || 0) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function minorToDecimalString(minor) {
  return (Number(minor) / 100).toFixed(2);
}

export function decimalToMinor(value) {
  const text = String(value ?? "").trim();
  if (!/^\d+(\.\d+)?$/.test(text)) return NaN;
  return Math.round(Number(text) * 100);
}

// mirrors public.recalculate_document so the editor shows the same totals the database will store
export function computeTotals(items = [], discountMinor = 0, taxRate = 0) {
  const subtotal = items.reduce((sum, i) => sum + Math.round(Number(i.quantity || 0) * Number(i.unit_price_minor || 0)), 0);
  const discount = Math.min(Math.max(Number(discountMinor) || 0, 0), subtotal);
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * Number(taxRate || 0)) / 100);
  return { subtotal, discount, tax, total: taxable + tax };
}

export function marginOf(totalBeforeTaxMinor, costsMinor) {
  const profit = totalBeforeTaxMinor - costsMinor;
  const pct = totalBeforeTaxMinor > 0 ? (profit / totalBeforeTaxMinor) * 100 : 0;
  return { profit, pct };
}
