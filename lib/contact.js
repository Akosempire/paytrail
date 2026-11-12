// At least one way for customers to reach a business: an email that looks real,
// or a phone number with enough digits. Used by onboarding. Pure: tested in node.
export function contactOk(email, phone) {
  const e = String(email || "").trim(), p = String(phone || "").replace(/\D/g, "");
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || p.length >= 7;
}
