import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";

// Public totals for the website: people using Usetally and money processed
// in naira and dollars. Totals only. Switch off in Admin → Settings.
export const dynamic = "force-dynamic";

export async function GET() {
  let stats = null;
  if (supabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { data, error } = await createSupabaseService().rpc("public_stats");
      if (!error && data) stats = { users: Number(data.users) || 0, businesses: Number(data.businesses) || 0, ngnMinor: Number(data.ngn_minor) || 0, usdMinor: Number(data.usd_minor) || 0, payments: Number(data.payments) || 0 };
    } catch {}
  }
  return Response.json({ stats }, { headers: { "Cache-Control": "public, max-age=120, s-maxage=600, stale-while-revalidate=1800" } });
}
