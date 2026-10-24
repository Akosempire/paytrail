// Test fixtures only (never used by the app): documents of different shapes
// for exercising the template renderers.
export const business = {
  id: "b1", name: "Adeyemi Creative Studio & Partners Limited (Lagos Office)", legal_name: "Adeyemi Creative Studio Ltd",
  email: "accounts@adeyemistudio.ng", phone: "+234 803 000 0000", website: "adeyemistudio.ng",
  address: "Plot 14, Admiralty Way, Lekki Phase 1, beside the very long shopping plaza with a very long name", city: "Lagos", country: "Nigeria",
  tax_id: "12345678-0001", logo_path: null, brand_color: "#1570EF", footer_note: "Thank you for your business.",
  bank_name: "GTBank", bank_account_name: "Adeyemi Creative Studio Ltd", bank_account_number: "0123456789", document_prefs: {},
};
export function doc(over = {}) {
  return {
    id: "d1", business_id: "b1", kind: "invoice", number: "INV-0042", title: "Website redesign and brand refresh", currency: "NGN",
    status: "sent", issue_date: "2026-10-24", due_date: "2026-10-31", valid_until: null,
    customer_name: "Chioma Obi", customer_company: "Obi Foods Ltd", customer_email: "chioma@obifoods.test", customer_phone: "+234 802 000 0000",
    customer_address: "12 Akin Adesola Street, Victoria Island, Lagos, Nigeria",
    subtotal_minor: 122000000, discount_minor: 5000000, tax_label: "VAT", tax_rate: 7.5, tax_minor: 8775000, total_minor: 125775000, amount_paid_minor: 0,
    notes: "50% deposit to begin, balance on delivery.", terms: "Payment due within 7 days. Late payments attract 2% monthly interest.",
    payment_instructions: "Pay by transfer or card using the link.", template: "signature", paper: "a4", layout: {}, snapshot: null,
    access_token: "a".repeat(48), ...over,
  };
}
export function items(n = 3, long = false) {
  return Array.from({ length: n }, (_, i) => ({
    description: long && i % 3 === 0 ? `Item ${i + 1}: a deliberately long description that keeps going to check wrapping behaviour across columns and pages` : `Item ${i + 1}`,
    details: i % 2 ? "Details line one\nDetails line two" : "",
    quantity: (i % 4) + 1, unit_price_minor: 1500000 + i * 12345,
  }));
}
