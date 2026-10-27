// Countries offered at sign-up and in settings. Picking one suggests the
// currency and the name of the sales tax; Nigeria-only features (VAT returns,
// NRS e-invoicing, NIPOST postcodes) follow the country, so it's required.
// code: ISO 3166 alpha-2. Stored on the business as the name.
export const COUNTRIES = [
  { code: "NG", name: "Nigeria", currency: "NGN", tax: "VAT" },
  { code: "GH", name: "Ghana", currency: "GHS", tax: "VAT" },
  { code: "KE", name: "Kenya", currency: "KES", tax: "VAT" },
  { code: "ZA", name: "South Africa", currency: "ZAR", tax: "VAT" },
  { code: "CI", name: "Côte d'Ivoire", currency: "XOF", tax: "TVA" },
  { code: "SN", name: "Senegal", currency: "XOF", tax: "TVA" },
  { code: "BJ", name: "Benin", currency: "XOF", tax: "TVA" },
  { code: "TG", name: "Togo", currency: "XOF", tax: "TVA" },
  { code: "CM", name: "Cameroon", currency: "USD", tax: "VAT" },
  { code: "RW", name: "Rwanda", currency: "USD", tax: "VAT" },
  { code: "UG", name: "Uganda", currency: "USD", tax: "VAT" },
  { code: "TZ", name: "Tanzania", currency: "USD", tax: "VAT" },
  { code: "EG", name: "Egypt", currency: "USD", tax: "VAT" },
  { code: "AE", name: "United Arab Emirates", currency: "AED", tax: "VAT" },
  { code: "GB", name: "United Kingdom", currency: "GBP", tax: "VAT" },
  { code: "IE", name: "Ireland", currency: "EUR", tax: "VAT" },
  { code: "DE", name: "Germany", currency: "EUR", tax: "VAT" },
  { code: "FR", name: "France", currency: "EUR", tax: "TVA" },
  { code: "NL", name: "Netherlands", currency: "EUR", tax: "VAT" },
  { code: "US", name: "United States", currency: "USD", tax: "Sales tax" },
  { code: "CA", name: "Canada", currency: "CAD", tax: "GST" },
  { code: "IN", name: "India", currency: "INR", tax: "GST" },
  { code: "SG", name: "Singapore", currency: "SGD", tax: "GST" },
  { code: "AU", name: "Australia", currency: "AUD", tax: "GST" },
];
export const OTHER = "Other";

export const countryByName = (name) => COUNTRIES.find((c) => c.name.toLowerCase() === String(name || "").trim().toLowerCase()) || null;

// a first guess from the device's time zone (Africa/Lagos → Nigeria)
const ZONES = { "Africa/Lagos": "NG", "Africa/Accra": "GH", "Africa/Nairobi": "KE", "Africa/Johannesburg": "ZA", "Africa/Abidjan": "CI", "Africa/Dakar": "SN",
  "Africa/Porto-Novo": "BJ", "Africa/Lome": "TG", "Africa/Douala": "CM", "Africa/Kigali": "RW", "Africa/Kampala": "UG", "Africa/Dar_es_Salaam": "TZ", "Africa/Cairo": "EG",
  "Asia/Dubai": "AE", "Europe/London": "GB", "Europe/Dublin": "IE", "Europe/Berlin": "DE", "Europe/Paris": "FR", "Europe/Amsterdam": "NL",
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Singapore": "SG" };
export function guessCountry(timeZone) {
  const tz = String(timeZone || "");
  const code = ZONES[tz] || (tz.startsWith("America/") && /Toronto|Vancouver|Edmonton|Winnipeg|Halifax|Regina|St_Johns/.test(tz) ? "CA" : tz.startsWith("America/") ? "US" : tz.startsWith("Australia/") ? "AU" : null);
  return COUNTRIES.find((c) => c.code === code) || null;
}
