import "server-only";
import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";

// active plans and trial settings for public pages (landing, llms.txt, JSON-LD)
export async function publicPlans() {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { plans: [], trial: null, offers: [], offer: null };
  try {
    const service = createSupabaseService();
    const [{ data: plans }, { data: trial }] = await Promise.all([
      service.from("plans").select("id, name, tagline, price_minor, currency, billing_interval, document_limit, seat_limit, allow_company, features, active, sort_order").eq("active", true).order("sort_order").order("price_minor"),
      service.from("platform_settings").select("trial_mode, trial_documents, trial_days").eq("id", true).maybeSingle(),
    ]);
    // hidden offers with spots left (Founding), one per currency at most; the
    // landing page shows the one in the visitor's currency
    const offers = [];
    const { data: hidden } = await service.from("plans").select("id, name, price_minor, currency, billing_interval, spots").eq("active", false).gt("spots", 0).order("sort_order");
    for (const h of hidden || []) {
      if (offers.some((o) => o.currency === h.currency)) continue;
      const { data: left } = await service.rpc("plan_spots_left", { plan: h.id });
      if (left > 0) offers.push({ ...h, left });
    }
    return { plans: plans || [], trial, offers, offer: offers[0] || null };
  } catch { return { plans: [], trial: null, offers: [], offer: null }; }
}
