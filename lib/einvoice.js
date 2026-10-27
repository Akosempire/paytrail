// E-invoicing readiness. Nigeria's e-invoicing (NRS Merchant Buyer Solution)
// uses the UBL / BIS Billing 3.0 standard: every invoice is sent through an
// approved provider, which returns an Invoice Reference Number (IRN) and a QR
// code. Before Usetally connects to one, this does two things:
//   readiness(): what's missing on an invoice for it to be accepted
//   ubl():       the invoice as a UBL 2.1 (BIS Billing 3.0) XML file you can
//                give to a provider or your accountant
// Client-safe; no network.

const COUNTRY = { nigeria: "NG", ghana: "GH", kenya: "KE", "south africa": "ZA", "united kingdom": "GB", uk: "GB", "united states": "US", usa: "US", "côte d'ivoire": "CI", "cote d'ivoire": "CI", senegal: "SN", rwanda: "RW", uganda: "UG", tanzania: "TZ", egypt: "EG", canada: "CA" };
export const countryCode = (name) => {
  const n = String(name || "").trim();
  if (/^[A-Z]{2}$/.test(n)) return n;
  const l = n.toLowerCase();
  return COUNTRY[l] || Object.entries(COUNTRY).find(([k]) => k.length > 3 && l.includes(k))?.[1] || "";
};
// Nigeria-only tax features (monthly VAT returns due on the 21st, "File & pay
// for me", NRS e-invoicing) show only to Nigerian businesses. No country set:
// go by the currency.
export const inNigeria = (b) => { const c = countryCode(b?.country); return c ? c === "NG" : b?.currency === "NGN"; };

// "missing" blocks an e-invoice; "advice" is worth fixing
export function readiness(doc, items, business) {
  const missing = [], advice = [];
  if (doc.kind !== "invoice") return { ready: false, missing: ["Only invoices are e-invoiced"], advice };
  if (!business.tax_id) missing.push("Your business tax ID (Settings → Business & branding)");
  if (!business.address || !(business.city || business.country)) missing.push("Your business address and city");
  if (!countryCode(business.country)) missing.push("Your country (Settings → Business & branding)");
  if (!doc.customer_name) missing.push("The customer's name");
  if (!items?.length) missing.push("At least one item");
  if (!doc.issue_date) missing.push("The issue date");
  if (!doc.customer_tax_id) advice.push("The customer's tax ID, if they're a business (they need it to claim VAT)");
  if (!doc.customer_address) advice.push("The customer's address");
  if (!doc.due_date) advice.push("A due date");
  return { ready: missing.length === 0, missing, advice };
}

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const amt = (minor) => (Math.round(minor) / 100).toFixed(2);
const CAT = { standard: "S", zero: "Z", exempt: "E" };

// amounts per VAT category, matching the invoice's own totals to the kobo
export function breakdown(doc, items) {
  const rate = Number(doc.tax_rate || 0), inc = Boolean(doc.prices_include_vat);
  const gross = (i) => Math.round(Number(i.quantity || 0) * Number(i.unit_price_minor || 0));
  const cat = (i) => (i.vat_category === "zero" || i.vat_category === "exempt" ? i.vat_category : "standard");
  const sub = items.reduce((t, i) => t + gross(i), 0), disc = Math.min(Number(doc.discount_minor || 0), sub);
  const lines = items.map((i) => ({ ...i, cat: cat(i), gross: gross(i), net: inc && cat(i) === "standard" ? (gross(i) * 100) / (100 + rate) : gross(i) }));
  const groups = {};
  for (const k of ["standard", "zero", "exempt"]) {
    const ls = lines.filter((l) => l.cat === k);
    if (!ls.length) continue;
    const g = ls.reduce((t, l) => t + l.gross, 0), n = ls.reduce((t, l) => t + l.net, 0);
    const after = sub ? g - (disc * g) / sub : 0; // this category's share of the discount
    const base = k === "standard" ? (inc ? after - Number(doc.tax_minor || 0) : after) : after;
    groups[k] = { lineNet: n, allowance: n - base, base, tax: k === "standard" ? Number(doc.tax_minor || 0) : 0, percent: k === "standard" ? rate : 0 };
  }
  return { lines, groups };
}

export function ubl({ doc, items, business }) {
  const { lines, groups } = breakdown(doc, items);
  const cur = doc.currency;
  const A = (minor) => `currencyID="${esc(cur)}">${amt(minor)}`;
  const taxCat = (k, percent) => `<cbc:ID>${CAT[k]}</cbc:ID><cbc:Percent>${percent}</cbc:Percent>${k === "exempt" ? "<cbc:TaxExemptionReason>Exempt from VAT</cbc:TaxExemptionReason>" : ""}<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>`;
  const party = ({ name, legal, tin, street, city, country, email, phone }) => `<cac:Party>
      ${email ? `<cbc:EndpointID schemeID="EM">${esc(email)}</cbc:EndpointID>` : ""}
      <cac:PartyName><cbc:Name>${esc(name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>${street ? `<cbc:StreetName>${esc(street)}</cbc:StreetName>` : ""}${city ? `<cbc:CityName>${esc(city)}</cbc:CityName>` : ""}<cac:Country><cbc:IdentificationCode>${esc(country || "NG")}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      ${tin ? `<cac:PartyTaxScheme><cbc:CompanyID>${esc(tin)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>` : ""}
      <cac:PartyLegalEntity><cbc:RegistrationName>${esc(legal || name)}</cbc:RegistrationName>${tin ? `<cbc:CompanyID>${esc(tin)}</cbc:CompanyID>` : ""}</cac:PartyLegalEntity>
      ${email || phone ? `<cac:Contact>${phone ? `<cbc:Telephone>${esc(phone)}</cbc:Telephone>` : ""}${email ? `<cbc:ElectronicMail>${esc(email)}</cbc:ElectronicMail>` : ""}</cac:Contact>` : ""}
    </cac:Party>`;
  const lineExt = Object.values(groups).reduce((t, g) => t + g.lineNet, 0);
  const allowances = Object.values(groups).reduce((t, g) => t + g.allowance, 0);
  const taxExcl = Object.values(groups).reduce((t, g) => t + g.base, 0);
  const tax = Number(doc.tax_minor || 0), paid = Number(doc.amount_paid_minor || 0);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${esc(doc.number)}</cbc:ID>
  <cbc:IssueDate>${esc(doc.issue_date)}</cbc:IssueDate>
  ${doc.due_date ? `<cbc:DueDate>${esc(doc.due_date)}</cbc:DueDate>` : ""}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  ${doc.notes ? `<cbc:Note>${esc(String(doc.notes).slice(0, 1000))}</cbc:Note>` : ""}
  <cbc:DocumentCurrencyCode>${esc(cur)}</cbc:DocumentCurrencyCode>
  ${doc.title ? `<cbc:BuyerReference>${esc(doc.title.slice(0, 200))}</cbc:BuyerReference>` : ""}
  <cac:AccountingSupplierParty>
    ${party({ name: business.name, legal: business.legal_name, tin: business.tax_id, street: business.address, city: business.city, country: countryCode(business.country), email: business.email, phone: business.phone })}
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    ${party({ name: doc.customer_company || doc.customer_name, legal: doc.customer_company || doc.customer_name, tin: doc.customer_tax_id, street: doc.customer_address, city: "", country: countryCode(business.country), email: doc.customer_email, phone: doc.customer_phone })}
  </cac:AccountingCustomerParty>
  ${business.bank_account_number ? `<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode><cbc:PaymentID>${esc(doc.number)}</cbc:PaymentID><cac:PayeeFinancialAccount><cbc:ID>${esc(business.bank_account_number)}</cbc:ID><cbc:Name>${esc(business.bank_account_name || business.name)}</cbc:Name>${business.bank_name ? `<cac:FinancialInstitutionBranch><cbc:ID>${esc(business.bank_name)}</cbc:ID></cac:FinancialInstitutionBranch>` : ""}</cac:PayeeFinancialAccount></cac:PaymentMeans>` : ""}
${Object.entries(groups).filter(([, g]) => Math.round(g.allowance) > 0).map(([k, g]) => `  <cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>Discount</cbc:AllowanceChargeReason><cbc:Amount ${A(g.allowance)}</cbc:Amount><cac:TaxCategory>${taxCat(k, g.percent)}</cac:TaxCategory></cac:AllowanceCharge>`).join("\n")}
  <cac:TaxTotal>
    <cbc:TaxAmount ${A(tax)}</cbc:TaxAmount>
${Object.entries(groups).map(([k, g]) => `    <cac:TaxSubtotal><cbc:TaxableAmount ${A(g.base)}</cbc:TaxableAmount><cbc:TaxAmount ${A(g.tax)}</cbc:TaxAmount><cac:TaxCategory>${taxCat(k, g.percent)}</cac:TaxCategory></cac:TaxSubtotal>`).join("\n")}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount ${A(lineExt)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount ${A(taxExcl)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount ${A(taxExcl + tax)}</cbc:TaxInclusiveAmount>
    ${Math.round(allowances) > 0 ? `<cbc:AllowanceTotalAmount ${A(allowances)}</cbc:AllowanceTotalAmount>` : ""}
    ${paid > 0 ? `<cbc:PrepaidAmount ${A(paid)}</cbc:PrepaidAmount>` : ""}
    <cbc:PayableAmount ${A(taxExcl + tax - paid)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
${lines.map((l, n) => `  <cac:InvoiceLine>
    <cbc:ID>${n + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${Number(l.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount ${A(l.net)}</cbc:LineExtensionAmount>
    <cac:Item>${l.details ? `<cbc:Description>${esc(l.details)}</cbc:Description>` : ""}<cbc:Name>${esc(l.description)}</cbc:Name><cac:ClassifiedTaxCategory>${taxCat(l.cat, l.cat === "standard" ? Number(doc.tax_rate || 0) : 0)}</cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount ${A(Number(l.quantity) ? l.net / Number(l.quantity) : 0)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>`).join("\n")}
</Invoice>
`;
}
