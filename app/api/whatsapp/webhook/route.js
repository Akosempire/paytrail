import { after } from "next/server";
import { createSupabaseService } from "@/lib/supabase/server";
import { verifyTwilioSignature } from "@/lib/whatsapp/core";
import { webhookUrl, whatsappConfig } from "@/lib/whatsapp/config";
import { siteUrl } from "@/lib/site";

// Twilio calls this for every WhatsApp message sent to the bot's number
// (Admin → Integrations → WhatsApp shows the address to paste in Twilio).
// The signature proves it's Twilio; the reply is sent afterwards through
// Twilio's API, so Twilio gets its answer straight away and never retries.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EMPTY = () => new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>", { status: 200, headers: { "content-type": "text/xml" } });

export async function POST(request) {
  const cfg = await whatsappConfig();
  if (!cfg.connected) return new Response("WhatsApp isn't set up", { status: 503 });
  const form = await request.formData().catch(() => null);
  if (!form) return new Response("Bad request", { status: 400 });
  const params = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const signature = request.headers.get("x-twilio-signature") || "";
  // the address Twilio was given, or the one it reached (a custom domain or www)
  const urls = [...new Set([webhookUrl(), request.url, request.url.replace(/^http:/, "https:")])];
  if (!urls.some((u) => verifyTwilioSignature(cfg.authToken, u, params, signature))) {
    console.warn("whatsapp.bad_signature");
    return new Response("Forbidden", { status: 403 });
  }
  if (params.AccountSid !== cfg.accountSid) return new Response("Forbidden", { status: 403 });
  // switched off in the admin area: take the message, say nothing
  if (!cfg.enabled || !params.From) return EMPTY();

  const job = async () => {
    const { handleIncoming } = await import("@/lib/whatsapp/bot");
    await handleIncoming({ service: createSupabaseService(), cfg, site: siteUrl(), from: params.From, text: params.Body || "", sid: params.MessageSid || params.SmsMessageSid || "", numMedia: Number(params.NumMedia || 0) })
      .catch((e) => console.error("whatsapp.webhook_failed", { message: e?.message }));
  };
  try { after(job); } catch { await job(); }
  return EMPTY();
}

export function GET() {
  return new Response("Usetally WhatsApp webhook. Twilio sends messages here with POST.", { status: 200 });
}
