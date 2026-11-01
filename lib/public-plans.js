import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";

const EMPTY = { plans: [], trial: null, offers: [], offer: null };
export const PUBLIC_PLANS_TAG = "public-plans";

// Active plans, trial settings and Founding-style offers, read with all the
// queries at once (not one after another).
async function loadPublicPlans() {
  const service = createSupabaseService();
  const [{ data: plans, error }, { data: trial }, { data: hidden }] = await Promise.all([
    service.from("plans").select("id, name, tagline, price_minor, currency, billing_interval, document_limit, seat_limit, allow_company, features, active, sort_order").eq("active", true).order("sort_order").order("price_minor"),
    service.from("platform_settings").select("trial_mode, trial_documents, trial_days").eq("id", true).maybeSingle(),
    service.from("plans").select("id, name, price_minor, currency, billing_interval, spots").eq("active", false).gt("spots", 0).order("sort_order"),
  ]);
  // a failed read must not be cached as "no plans"
  if (error) throw error;
  // hidden offers with spots left (Founding), one per currency at most; the
  // landing page shows the one in the visitor's currency
  const firstPerCurrency = [];
  for (const h of hidden || []) if (!firstPerCurrency.some((o) => o.currency === h.currency)) firstPerCurrency.push(h);
  const lefts = await Promise.all(firstPerCurrency.map((h) => service.rpc("plan_spots_left", { plan: h.id }).then((r) => r.data)));
  const offers = firstPerCurrency.map((h, i) => ({ ...h, left: lefts[i] })).filter((o) => o.left > 0);
  return { plans: plans || [], trial, offers, offer: offers[0] || null };
}

// Cached for two minutes and shared by every visitor, so the landing page
// doesn't wait on the database for each one. Saving a plan or the trial
// settings in Admin clears it straight away (updateTag in app/admin/actions).
const cachedPublicPlans = unstable_cache(loadPublicPlans, ["public-plans-v1"], { revalidate: 120, tags: [PUBLIC_PLANS_TAG] });

// active plans and trial settings for public pages (landing, llms.txt, JSON-LD)
export async function publicPlans() {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return EMPTY;
  try { return await cachedPublicPlans(); } catch { return EMPTY; }
}
