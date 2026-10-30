import { timingSafeEqual } from "node:crypto";
import { emailConfigured, sendEmail } from "@/lib/email";
import { trackojaEmail } from "@/lib/emails";
import { underLimit } from "@/lib/guard";
import { checkNotify } from "@/lib/notify-core";

// TrackOja's Edge Functions send owner emails through Usetally's email setup
// (Admin → Settings → Email). Authorization: Bearer <TRACKOJA_SUPPORT_SECRET>,
// the same shared secret as /api/support/trackoja. One recipient per call.
export const dynamic = "force-dynamic";
const json = (body, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function authorized(request) {
  const secret = process.env.TRACKOJA_SUPPORT_SECRET || "";
  const m = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get("authorization") || "");
  if (secret.length < 32 || !m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request) {
  if (!authorized(request)) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = JSON.parse((await request.text()).slice(0, 40000)); } catch { return json({ error: "Send valid JSON" }, 400); }
  const v = checkNotify(body);
  if (!v.ok) return json({ error: v.error }, 400);
  // at most 10 emails an hour to one address, 1,000 an hour in all
  if (!(await underLimit("tknotify", v.value.to, 3600, 10)) || !(await underLimit("tknotify-all", "all", 3600, 1000))) {
    return json({ error: "Too many emails. Try again later." }, 429);
  }
  if (!(await emailConfigured())) return json({ error: "Email isn't set up on Usetally" }, 503);
  const r = await sendEmail({ to: v.value.to, fromName: "TrackOja", ...trackojaEmail(v.value) });
  return r.sent ? json({ sent: true }) : json({ error: "The email could not be sent" }, 502);
}
