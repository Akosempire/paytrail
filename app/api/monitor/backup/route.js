import { safeEqual } from "@/lib/crypto";
import { createSupabaseService } from "@/lib/supabase/server";
import { reportFailure } from "@/lib/monitor";

// The nightly backup job (.github/workflows/backup.yml) reports here.
// Success is logged (Admin → Health shows when the last backup ran); a
// failure is logged and alerts you straight away.
export const dynamic = "force-dynamic";

const size = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export async function POST(request) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!secret || !safeEqual(given, secret)) return new Response("Unauthorized", { status: 401 });
  const body = await request.json().catch(() => ({}));
  const clean = (v, n = 300) => String(v ?? "").replace(/[^\w .,:/()@+-]/g, "").slice(0, n);
  if (body.ok) {
    const detail = `Saved ${clean(body.file, 120)} (${size(Number(body.bytes) || 0)}) to ${clean(body.where, 40) || "GitHub"}.`;
    await createSupabaseService().from("monitor_events").insert({ kind: "backup", detail });
    return Response.json({ ok: true });
  }
  await reportFailure("backup_failed", `${clean(body.detail) || "The nightly backup failed."}${body.run ? ` ${clean(body.run, 200)}` : ""}`);
  return Response.json({ ok: true });
}
