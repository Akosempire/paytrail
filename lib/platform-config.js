import "server-only";

// Platform settings an admin sets in the dashboard (Admin → Integrations and
// Admin → Settings): analytics, company & legal details, alert recipients.
// Read with the service key, kept for 60 seconds, with the old Vercel
// variables as a fallback for anything not filled in.
const clean = (v) => String(v ?? "").trim();
let cache = null;
export function forgetPlatformConfig() { cache = null; }

export async function platformConfig() {
  if (cache && Date.now() - cache.at < 60_000) return cache.value;
  let row = null, ok = true;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { createSupabaseService } = await import("@/lib/supabase/server");
      const { data, error } = await createSupabaseService().from("platform_settings").select("*").eq("id", true).maybeSingle();
      if (error) ok = false; else row = data;
    } catch { ok = false; }
  }
  const r = row || {};
  const value = {
    analytics: {
      sabilytics: clean(r.analytics_sabilytics_site) ? { site: clean(r.analytics_sabilytics_site), domain: clean(r.analytics_sabilytics_domain) || "usetally.cc" } : null,
      ga: /^G-[A-Z0-9]{4,}$/i.test(clean(r.analytics_ga_id)) ? clean(r.analytics_ga_id).toUpperCase() : null,
    },
    legal: {
      company: clean(r.legal_company) || clean(process.env.LEGAL_COMPANY_NAME) || "Usetally",
      address: clean(r.legal_address) || clean(process.env.LEGAL_ADDRESS),
      email: clean(r.legal_email) || clean(process.env.LEGAL_EMAIL) || clean(r.support_email),
      law: clean(r.legal_law) || clean(process.env.LEGAL_GOVERNING_LAW),
      courts: clean(r.legal_courts) || clean(process.env.LEGAL_COURTS),
      region: clean(r.legal_data_region) || clean(process.env.LEGAL_DATA_REGION) || "European Union",
    },
    alertEmails: (clean(r.alert_emails) || clean(process.env.ADMIN_ALERT_EMAILS)).split(/[\s,;]+/).filter((e) => /^\S+@\S+\.\S+$/.test(e)),
    supportEmail: clean(r.support_email),
    saved: row,
  };
  if (ok) cache = { at: Date.now(), value };
  return value;
}
