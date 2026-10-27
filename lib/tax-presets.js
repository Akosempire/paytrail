// Suggested sales taxes per country (and, for Canada, per province), checked
// October 2026. These are only defaults: every business can edit the names and
// rates, and many small businesses aren't registered, so they start at 0
// until the owner says they charge tax. Client-safe.

// [name, rate %] — one tax, or two where both show on the invoice
export const COUNTRY_TAX = {
  NG: [["VAT", 7.5]],
  GH: [["VAT", 20]], // since Jan 2026: one 20% rate, NHIL and GETFund included
  KE: [["VAT", 16]],
  ZA: [["VAT", 15]],
  CI: [["TVA", 18]], SN: [["TVA", 18]], BJ: [["TVA", 18]], TG: [["TVA", 18]],
  CM: [["VAT", 19.25]],
  RW: [["VAT", 18]], UG: [["VAT", 18]], TZ: [["VAT", 18]],
  EG: [["VAT", 14]],
  AE: [["VAT", 5]],
  GB: [["VAT", 20]],
  IE: [["VAT", 23]], DE: [["VAT", 19]], FR: [["TVA", 20]], NL: [["VAT", 21]],
  US: [["Sales tax", 0]], // set by state (and city): the owner enters theirs
  IN: [["GST", 18]],
  SG: [["GST", 9]],
  AU: [["GST", 10]],
  CA: [["GST", 5]], // the province decides the rest
};

// Canada: GST everywhere; HST (one combined tax) in five provinces; provincial
// tax on top in BC, Manitoba, Québec and Saskatchewan.
export const REGIONS = {
  CA: [
    { code: "AB", name: "Alberta", taxes: [["GST", 5]] },
    { code: "BC", name: "British Columbia", taxes: [["GST", 5], ["PST", 7]] },
    { code: "MB", name: "Manitoba", taxes: [["GST", 5], ["RST", 7]] },
    { code: "NB", name: "New Brunswick", taxes: [["HST", 15]] },
    { code: "NL", name: "Newfoundland and Labrador", taxes: [["HST", 15]] },
    { code: "NT", name: "Northwest Territories", taxes: [["GST", 5]] },
    { code: "NS", name: "Nova Scotia", taxes: [["HST", 14]] },
    { code: "NU", name: "Nunavut", taxes: [["GST", 5]] },
    { code: "ON", name: "Ontario", taxes: [["HST", 13]] },
    { code: "PE", name: "Prince Edward Island", taxes: [["HST", 15]] },
    { code: "QC", name: "Québec", taxes: [["GST", 5], ["QST", 9.975]] },
    { code: "SK", name: "Saskatchewan", taxes: [["GST", 5], ["PST", 6]] },
    { code: "YT", name: "Yukon", taxes: [["GST", 5]] },
  ],
};
export const REGION_LABEL = { CA: "Province or territory" };

export const regionsFor = (countryCode) => REGIONS[countryCode] || null;

// the suggested taxes for a country (+ region): [[name, rate], ...] (1 or 2)
export function taxPreset(countryCode, regionCode) {
  const region = (REGIONS[countryCode] || []).find((r) => r.code === regionCode);
  return region ? region.taxes : COUNTRY_TAX[countryCode] || null;
}

// as business fields
export function presetFields(countryCode, regionCode) {
  const t = taxPreset(countryCode, regionCode);
  if (!t) return null;
  return { tax_label: t[0][0], tax_rate: t[0][1], tax2_label: t[1]?.[0] || "", tax2_rate: t[1]?.[1] || 0 };
}

// "GST 5% + PST 7%"
export const presetText = (t) => (t || []).map(([n, r]) => `${n} ${r}%`).join(" + ");
