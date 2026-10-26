import { safeEqual } from "@/lib/crypto";
import { runChecks } from "@/lib/monitor";

// Runs the health checks. Call it every 5 minutes from a free pinger
// (cron-job.org, UptimeRobot…): Authorization: Bearer <CRON_SECRET>, or
// ?key=<CRON_SECRET> for pingers that can't send headers. Answers 503 when
// something is broken, so the pinger can alert you too.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || new URL(request.url).searchParams.get("key") || "";
  if (!secret || !safeEqual(given, secret)) return new Response("Unauthorized", { status: 401 });
  const out = await runChecks();
  const down = out.results.filter((r) => r.status === "down");
  return Response.json({ ok: !down.length, checked_at: new Date().toISOString(), checks: Object.fromEntries(out.results.map((r) => [r.key, { status: r.status, detail: r.detail }])), alerted: out.alerted || 0, note: out.note },
    { status: down.length ? 503 : 200, headers: { "Cache-Control": "no-store" } });
}
