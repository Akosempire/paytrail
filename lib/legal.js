import "server-only";
import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";

// Who operates Usetally. Set these in your hosting environment variables.
export async function legalDetails() {
  let email = process.env.LEGAL_EMAIL || "";
  if (!email && supabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await createSupabaseService().from("platform_settings").select("support_email").eq("id", true).maybeSingle();
    email = data?.support_email || "";
  }
  return {
    company: process.env.LEGAL_COMPANY_NAME || "Usetally",
    address: process.env.LEGAL_ADDRESS || "",
    // e.g. LEGAL_GOVERNING_LAW="England and Wales", LEGAL_COURTS="the courts of England"
    law: process.env.LEGAL_GOVERNING_LAW || "",
    courts: process.env.LEGAL_COURTS || "",
    email: email || "support@usetally.cc",
    updated: "24 October 2026",
  };
}

// The services that store or process personal data for Usetally. Shown on
// /subprocessors and referenced by the Data Processing Agreement. Update the
// list (and the "updated" date above) when you add or change a provider.
export function subprocessors() {
  const region = process.env.LEGAL_DATA_REGION || "European Union";
  const mail = process.env.LEGAL_EMAIL_PROVIDER || "";
  return [
    { name: "Supabase", purpose: "Database, sign-in and file storage (logos). Holds all account, business and customer data.", location: region, site: "https://supabase.com/privacy" },
    { name: "Vercel", purpose: "Hosts and runs the Usetally website and app; processes requests in transit.", location: "Global (United States company)", site: "https://vercel.com/legal/privacy-policy" },
    { name: mail || "Email delivery provider", purpose: "Sends account emails and the quotes, invoices and receipts you choose to email.", location: mail ? "See provider" : "Depends on provider", site: null },
    { name: "Stripe, Paystack, Flutterwave, Bachs", purpose: "Only when a business connects one: takes card and bank payments from its customers. Usetally sends the amount, the document reference and the customer's name, email and (for Flutterwave) phone number. Usetally's own plan billing uses one of these too.", location: "Varies by provider", site: null, note: "Each business has its own agreement with the provider it connects." },
  ];
}
