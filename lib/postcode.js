// Nigeria's digital postcode (NIPOST, launched 1 Oct 2026): 11 characters in
// five segments, written AA-99-H77-BB-55:
//   state (2 letters) · LGA (2 digits) · district (3 letters/digits) ·
//   area (2 letters) · building unit (2 digits)
// Numbers are zero-padded and run 01–99. Spaces, hyphens and case don't matter
// when typing. This file is safe for the browser; lookups live in
// lib/postcode-server.js (the API key never leaves the server).

export const POSTCODE_RE = /^[A-Z]{2}-(0[1-9]|[1-9]\d)-[A-Z0-9]{3}-[A-Z]{2}-(0[1-9]|[1-9]\d)$/;
const SEGMENTS = [2, 2, 3, 2, 2];

const compact = (v) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);

// "ek01a03fk01" / "EK 01 A03 FK 01" → "EK-01-A03-FK-01", or null when it can't be a postcode
export function normalizePostcode(v) {
  const s = compact(v);
  if (s.length !== 11) return null;
  const code = `${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 7)}-${s.slice(7, 9)}-${s.slice(9, 11)}`;
  return POSTCODE_RE.test(code) ? code : null;
}

// as the user types: uppercase, hyphens added between segments
export function formatPostcodeInput(v) {
  const s = compact(v);
  const parts = [];
  let i = 0;
  for (const n of SEGMENTS) { if (i >= s.length) break; parts.push(s.slice(i, i + n)); i += n; }
  return parts.join("-");
}

// what's wrong with a typed postcode, in plain words (null = fine or empty)
export function postcodeProblem(v) {
  const s = compact(v);
  if (!s) return null;
  if (s.length < 11) return "A postcode has 11 characters, like EK-01-A03-FK-01.";
  return normalizePostcode(s) ? null : "That doesn't look like a postcode. It reads like EK-01-A03-FK-01.";
}

// "ADO EKITI", "EKITI" → "Ado Ekiti, Ekiti"
export function areaLabel(a = {}) {
  const t = (x) => String(x || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  return [...new Set([t(a.locality_name || a.lga_name), t(a.state_name)].filter(Boolean))].join(", ");
}
