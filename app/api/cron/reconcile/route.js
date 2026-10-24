import { reconcilePending } from "@/lib/payments";
import { safeEqual } from "@/lib/crypto";

// Vercel Cron calls this daily (see vercel.json); pages also re-check in the
// background when businesses or customers open them. On Vercel Pro you can
// change the schedule to "*/15 * * * *" for faster catch-up.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(request.headers.get("authorization") || "", `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const results = await reconcilePending();
  return Response.json({ checked: results.length, results });
}
