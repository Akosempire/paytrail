import { getContext } from "@/lib/context";
import { underLimit } from "@/lib/guard";
import { usageArea } from "@/lib/usage-core";

// Active time from <UsageBeat/>: { items: [{ area, seconds }] }. Best effort,
// always 204: the browser never waits on it or retries it.
export const dynamic = "force-dynamic";
const done = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });

export async function POST(request) {
  const ctx = await getContext();
  if (!ctx.user || !ctx.business) return done();
  let body;
  try { body = JSON.parse((await request.text()).slice(0, 4000)); } catch { return done(); }
  if (!Array.isArray(body?.items) || !(await underLimit("usage", ctx.user.id, 60, 20))) return done();
  for (const it of body.items.slice(0, 10)) {
    const area = usageArea(it?.area);
    const secs = Math.round(Number(it?.seconds));
    if (!area || !Number.isFinite(secs) || secs <= 0) continue;
    await ctx.supabase.rpc("usage_add", { target: ctx.business.id, area_path: area, secs: Math.min(secs, 300) });
  }
  return done();
}
