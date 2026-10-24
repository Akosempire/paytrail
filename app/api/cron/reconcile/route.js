import { reconcilePending } from "@/lib/payments";
import { safeEqual } from "@/lib/crypto";

// Vercel Cron calls this every 15 minutes (see vercel.json). It re-checks
// payments that started but never reported back.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(request.headers.get("authorization") || "", `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const results = await reconcilePending();
  return Response.json({ checked: results.length, results });
}
