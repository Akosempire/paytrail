import { safeEqual } from "@/lib/crypto";
import { runChecks } from "@/lib/monitor";

// Runs the health checks. Call it every 5 minutes from a free pinger
// (cron-job.org, UptimeRobot…): Authorization: Bearer <CRON_SECRET>, or
// ?key=<MONITOR_KEY> for pingers that can't send headers. MONITOR_KEY only
// runs these read-only checks, so a URL that ends up in a log can't run the
// cron jobs. (?key=<CRON_SECRET> still works until MONITOR_KEY is set.)
// Answers 503 when something is broken, so the pinger can alert you too.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const monitorKey = process.env.MONITOR_KEY;
  const header = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const query = new URL(request.url).searchParams.get("key") || "";
  const ok = (header && secret && safeEqual(header, secret))
    || (query && (monitorKey ? safeEqual(query, monitorKey) : secret && safeEqual(query, secret)));
  if (!ok) return new Response("Unauthorized", { status: 401 });
  const out = await runChecks();
  const down = out.results.filter((r) => r.status === "down");
  return Response.json({ ok: !down.length, checked_at: new Date().toISOString(), checks: Object.fromEntries(out.results.map((r) => [r.key, { status: r.status, detail: r.detail }])), alerted: out.alerted || 0, note: out.note },
    { status: down.length ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
