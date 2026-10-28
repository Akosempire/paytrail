import { reconcilePending } from "@/lib/payments";
import { safeEqual } from "@/lib/crypto";
import { purgeDueBusinesses } from "@/lib/privacy";
import { sendClaimDigests } from "@/lib/claims-digest";
import { runChecks } from "@/lib/monitor";
import { sendVatReminders } from "@/lib/vat-returns";
import { pushPendingStock } from "@/lib/pos";

// Vercel Cron calls this daily (see vercel.json); pages also re-check in the
// background when businesses or customers open them. On Vercel Pro you can
// change the schedule to "*/15 * * * *" for faster catch-up.
// The same job permanently removes businesses whose 30-day deletion window
// has passed, emails each team its daily list of bank transfers to confirm, and
// retries TrackOja stock updates that failed.
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeEqual(request.headers.get("authorization") || "", `Bearer ${secret}`)) return new Response("Unauthorized", { status: 401 });
  const results = await reconcilePending();
  // TrackOja stock updates for paid invoices that didn't go through yet
  const stock = await pushPendingStock({ limit: 50 });
  const purged = await purgeDueBusinesses();
  const digests = await sendClaimDigests().catch((e) => ({ error: String(e?.message || e) }));
  const vatReminders = await sendVatReminders().catch((e) => ({ error: String(e?.message || e) }));
  const health = await runChecks().then((h) => h.results.map((r) => `${r.key}:${r.status}`), (e) => ({ error: String(e?.message || e) }));
  return Response.json({ checked: results.length, results, stock, purged, digests, vatReminders, health });
}
