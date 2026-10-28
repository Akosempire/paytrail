import { cronAuthorized } from "@/lib/meta-core";
import { runMarketingSync } from "@/lib/marketing";

// Every 6 hours (vercel.json): Meta ad results → Admin → Marketing, and the
// report email. Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  if (!cronAuthorized(request.headers.get("authorization"), process.env.CRON_SECRET)) return new Response("Unauthorized", { status: 401 });
  const result = await runMarketingSync({ trigger: "cron" }).catch((e) => ({ ok: false, error: String(e?.message || e) }));
  return Response.json(result);
}
