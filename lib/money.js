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
// Same rules as recalculate_document in the database: VAT only on
// standard-rated lines, after their share of the discount; with VAT-inclusive
// prices the VAT is the part already inside the price.
export const VAT_CATEGORIES = { standard: "Standard", zero: "Zero-rated", exempt: "Exempt" };
// Same maths as recalculate_document in the database. tax is ALL tax (both
// taxes); tax2 is the second tax's share (e.g. Canada's PST or QST), so
// total - tax is always the amount before tax.
export function computeTotals(items = [], discountMinor = 0, taxRate = 0, { inclusive = false, tax2Rate = 0 } = {}) {
  const line = (i) => Math.round(Number(i.quantity || 0) * Number(i.unit_price_minor || 0));
  const subtotal = items.reduce((sum, i) => sum + line(i), 0);
  const std = items.filter((i) => !i.vat_category || i.vat_category === "standard").reduce((sum, i) => sum + line(i), 0);
  const discount = Math.min(Math.max(Number(discountMinor) || 0, 0), subtotal);
  const r1 = Number(taxRate || 0), r2 = Number(tax2Rate || 0), rate = r1 + r2;
  const stdAfter = subtotal > 0 ? std - (discount * std) / subtotal : 0;
  let tax, tax2;
  if (inclusive) {
    tax = rate > 0 ? Math.round((stdAfter * rate) / (100 + rate)) : 0;
    tax2 = rate > 0 ? Math.round((tax * r2) / rate) : 0;
  } else {
    tax2 = Math.round((stdAfter * r2) / 100);
    tax = Math.round((stdAfter * r1) / 100) + tax2;
  }
  const total = inclusive ? subtotal - discount : subtotal - discount + tax;
  return { subtotal, discount, tax, tax1: tax - tax2, tax2, total, net: total - tax };
}

export function marginOf(totalBeforeTaxMinor, costsMinor) {
  const profit = totalBeforeTaxMinor - costsMinor;
  const pct = totalBeforeTaxMinor > 0 ? (profit / totalBeforeTaxMinor) * 100 : 0;
  return { profit, pct };
}
