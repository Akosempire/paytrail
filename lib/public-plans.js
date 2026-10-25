import "server-only";
import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";

// active plans and trial settings for public pages (landing, llms.txt, JSON-LD)
export async function publicPlans() {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return { plans: [], trial: null };
  try {
    const service = createSupabaseService();
    const [{ data: plans }, { data: trial }] = await Promise.all([
      service.from("plans").select("id, name, tagline, price_minor, currency, billing_interval, document_limit, seat_limit, allow_company, features, active, sort_order").eq("active", true).order("sort_order").order("price_minor"),
      service.from("platform_settings").select("trial_mode, trial_documents, trial_days").eq("id", true).maybeSingle(),
    ]);
    return { plans: plans || [], trial };
  } catch { return { plans: [], trial: null }; }
}
