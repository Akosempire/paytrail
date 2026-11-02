import "server-only";
import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";

// Free Supabase projects pause after about a week with no activity. Usetally's
// daily cron (/api/cron/reconcile) calls this, so both databases get a real
// query every day even when nobody signs in:
//  - Usetally: a one-row read
//  - TrackOja: its public price list (list_published_plans), the same call its
//    pricing page makes for any visitor. Needs TRACKOJA_SUPABASE_URL and
//    TRACKOJA_SUPABASE_ANON_KEY (the public anon key TrackOja's site already uses).
// Never throws.
export async function keepAlive({ fetchImpl = fetch, env = process.env } = {}) {
  const out = {};
  const t0 = Date.now();
  if (supabaseConfigured()) {
    try {
      const { error } = await createSupabaseService().from("platform_settings").select("id").limit(1);
      out.usetally = error ? { ok: false, error: String(error.message).slice(0, 120) } : { ok: true, ms: Date.now() - t0 };
    } catch (e) { out.usetally = { ok: false, error: String(e?.message || e).slice(0, 120) }; }
  }
  out.trackoja = await pingTrackOja({ fetchImpl, env });
  return out;
}

export async function pingTrackOja({ fetchImpl = fetch, env = process.env } = {}) {
  const base = String(env.TRACKOJA_SUPABASE_URL || "").trim().replace(/\/+$/, "");
  const key = String(env.TRACKOJA_SUPABASE_ANON_KEY || "").trim();
  if (!base || !key) return { ok: false, skipped: "Set TRACKOJA_SUPABASE_URL and TRACKOJA_SUPABASE_ANON_KEY to keep TrackOja's database awake." };
  if (!/^https:\/\//.test(base)) return { ok: false, error: "TRACKOJA_SUPABASE_URL must start with https://" };
  const t0 = Date.now();
  try {
    const r = await fetchImpl(`${base}/rest/v1/rpc/list_published_plans`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ p_product_key: "trackoja" }),
    });
    return r.ok ? { ok: true, status: r.status, ms: Date.now() - t0 } : { ok: false, status: r.status };
  } catch (e) {
    return { ok: false, error: e?.name === "TimeoutError" ? "TrackOja's database didn't answer in time" : "Couldn't reach TrackOja's database" };
  }
}
