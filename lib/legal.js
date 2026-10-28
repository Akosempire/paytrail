import "server-only";
import { platformConfig } from "@/lib/platform-config";
import { emailConfig } from "@/lib/email";
import { marketingSettings } from "@/lib/meta";

// Who operates Usetally: set in Admin → Settings → Company & legal.
export async function legalDetails() {
  const { legal } = await platformConfig();
  return {
    company: legal.company,
    address: legal.address,
    law: legal.law,
    courts: legal.courts,
    email: legal.email || "support@usetally.cc",
    updated: "24 October 2026",
  };
}

const EMAIL_PROVIDERS = { sendbyte: "Sendbyte", sendhiiv: "Sendhiiv", brevo: "Brevo", "brevo-smtp": "Brevo", smtp: "" };

// The services that store or process personal data for Usetally. Shown on
// /subprocessors and referenced by the Data Processing Agreement.
export async function subprocessors() {
  const { legal, analytics } = await platformConfig();
  const mail = EMAIL_PROVIDERS[(await emailConfig().catch(() => null))?.kind] || "";
  const metaPixel = Boolean((await marketingSettings().catch(() => null))?.pixelId);
  return [
    { name: "Supabase", purpose: "Database and sign-in (and older logo files). Holds all account, business and customer data.", location: legal.region, site: "https://supabase.com/privacy" },
    { name: "Cloudflare", purpose: "Stores business logos, signatures and files attached to documents (R2 storage).", location: "Global (United States company)", site: "https://www.cloudflare.com/privacypolicy/" },
    ...(analytics.sabilytics ? [{ name: "Sabilytics", purpose: "Website analytics: which pages are visited and how people arrive.", location: "See provider", site: "https://www.sabilytics.com" }] : []),
    ...(metaPixel ? [{ name: "Meta Platforms (Meta Pixel and Conversions API)", purpose: "Measures which ads bring sign-ups and payments: page views on the public website, and a hashed email and country when someone signs up or pays for a plan.", location: "Global (United States company)", site: "https://www.facebook.com/privacy/policy/" }] : []),
    ...(analytics.ga ? [{ name: "Google Analytics", purpose: "Website analytics: which pages are visited and how people arrive.", location: "Global (United States company)", site: "https://policies.google.com/privacy" }] : []),
    { name: "Vercel", purpose: "Hosts and runs the Usetally website and app; processes requests in transit.", location: "Global (United States company)", site: "https://vercel.com/legal/privacy-policy" },
    { name: mail || "Email delivery provider", purpose: "Sends account emails and the quotes, invoices and receipts you choose to email.", location: mail ? "See provider" : "Depends on provider", site: null },
    { name: "Stripe, Paystack, Flutterwave, Bachs", purpose: "Only when a business connects one: takes card and bank payments from its customers. Usetally sends the amount, the document reference and the customer's name, email and (for Flutterwave) phone number. Usetally's own plan billing uses one of these too.", location: "Varies by provider", site: null, note: "Each business has its own agreement with the provider it connects." },
  ];
}
