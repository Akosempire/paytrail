import { getContext } from "@/lib/context";
import { verifyPostcode } from "@/lib/postcode-server";

// GET /api/postcode?code=EK-01-A03-FK-01 → the live check behind the postcode
// field. Signed-in users only, so the NIPOST key can't be used by strangers.
export const dynamic = "force-dynamic";
const hits = new Map();

export async function GET(request) {
  const ctx = await getContext();
  if (!ctx.user) return Response.json({ status: "error" }, { status: 401 });
  const now = Date.now(), mine = (hits.get(ctx.user.id) || []).filter((t) => now - t < 60_000);
  if (mine.length >= 30) return Response.json({ status: "unchecked", reason: "slow_down" }, { status: 429 });
  hits.set(ctx.user.id, [...mine, now]);
  const r = await verifyPostcode(new URL(request.url).searchParams.get("code"));
  return Response.json(r, { headers: { "Cache-Control": "no-store" } });
}
