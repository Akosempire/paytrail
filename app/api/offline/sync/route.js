import { getContext } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { applyOfflineOps } from "@/lib/offline/apply";

// Changes made offline on a device, sent when it's back online (lib/offline/apply.js).
export const dynamic = "force-dynamic";

export async function POST(request) {
  const ctx = await getContext().catch(() => null);
  if (!ctx?.user || !ctx.business) return Response.json({ error: "signed_out" }, { status: 401 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "bad_request" }, { status: 400 }); }
  const out = await applyOfflineOps(ctx, createSupabaseService(), body?.ops, body?.ids);
  return Response.json(out, { headers: { "Cache-Control": "no-store" } });
}
