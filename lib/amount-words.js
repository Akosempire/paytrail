// "₦42,500,000.00" -> "Forty Two Million Five Hundred Thousand Naira Only"
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const SCALES = ["", "Thousand", "Million", "Billion", "Trillion"];

const NAMES = {
  NGN: ["Naira", "Kobo"], USD: ["Dollars", "Cents"], GBP: ["Pounds", "Pence"], EUR: ["Euros", "Cents"], CAD: ["Canadian Dollars", "Cents"],
  AUD: ["Australian Dollars", "Cents"], GHS: ["Cedis", "Pesewas"], KES: ["Kenyan Shillings", "Cents"], ZAR: ["Rand", "Cents"],
  XOF: ["CFA Francs", ""], AED: ["Dirhams", "Fils"], INR: ["Rupees", "Paise"], SGD: ["Singapore Dollars", "Cents"],
};

function hundreds(n) {
  const h = Math.floor(n / 100), rest = n % 100;
  const parts = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(rest < 20 ? ONES[rest] : `${TENS[Math.floor(rest / 10)]}${rest % 10 ? ` ${ONES[rest % 10]}` : ""}`);
  return parts.join(" ");
}

export function numberToWords(n) {
  n = Math.floor(Math.abs(Number(n) || 0));
  if (n === 0) return "Zero";
  const parts = [];
  for (let i = 0; n > 0 && i < SCALES.length; i++, n = Math.floor(n / 1000)) {
    const chunk = n % 1000;
    if (chunk) parts.unshift(`${hundreds(chunk)}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
  }
  return parts.join(" ");
}

export function amountInWords(minor, currency = "NGN") {
  const [major, sub] = NAMES[currency] || [currency, "Cents"];
  const v = Math.round(Math.abs(Number(minor) || 0));
  const whole = Math.floor(v / 100), cents = v % 100;
  return `${numberToWords(whole)} ${major}${cents && sub ? ` and ${numberToWords(cents)} ${sub}` : ""} Only`;
}
