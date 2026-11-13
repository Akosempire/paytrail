import "server-only";
import { normPhone, waAddress } from "@/lib/whatsapp/core";

// Twilio's REST API, called with fetch (no SDK). Messages go from the bot's
// WhatsApp number; business-started messages to customers use approved
// templates (Content SIDs), replies to the business owner are plain text.
const API = "https://api.twilio.com/2010-04-01";
const auth = (sid, token) => `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`;

async function call(cfg, path, { method = "GET", form } = {}) {
  const res = await fetch(`${API}/Accounts/${encodeURIComponent(cfg.accountSid)}${path}`, {
    method,
    headers: { authorization: auth(cfg.accountSid, cfg.authToken), ...(form ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: form ? new URLSearchParams(form).toString() : undefined,
    signal: AbortSignal.timeout(12_000),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// what went wrong, in words an admin can act on
function twilioError(r) {
  const code = r.data?.code;
  const msg = String(r.data?.message || "").slice(0, 200);
  if (r.status === 401 || code === 20003) return "Twilio didn't accept the Account SID and Auth Token. Copy both again from the Twilio Console home page.";
  if (code === 63007 || code === 21606) return "Twilio says the sender isn't a WhatsApp number on this account. Use the number shown under Messaging → Senders → WhatsApp senders (or the Sandbox number).";
  if (code === 63016) return "That person hasn't messaged the bot in the last 24 hours, so WhatsApp only allows an approved template. Ask them to send any message first, or set up the templates below.";
  if (code === 63015) return "That number hasn't joined your Twilio Sandbox yet. From it, send the join code shown in Twilio (Messaging → Try it out → WhatsApp).";
  if (code === 21211 || code === 21614) return "That phone number isn't valid on WhatsApp.";
  if (code === 21656 || code === 21655) return "Twilio couldn't use that template: check the Content SID and that the template is approved for WhatsApp.";
  return msg ? `Twilio: ${msg}${code ? ` (code ${code})` : ""}` : `Twilio answered ${r.status}.`;
}

// checks the account works; returns its name
export async function checkTwilio({ accountSid, authToken }) {
  if (!/^AC[0-9a-f]{32}$/i.test(accountSid || "")) return { ok: false, error: "The Account SID starts with AC followed by 32 letters and numbers. Copy it from the Twilio Console home page." };
  if (!/^[0-9a-f]{32}$/i.test(authToken || "")) return { ok: false, error: "The Auth Token is 32 letters and numbers. On the Twilio Console home page, select Show next to Auth Token and copy it." };
  try {
    const r = await call({ accountSid, authToken }, ".json");
    if (!r.ok) return { ok: false, error: twilioError(r) };
    if (r.data?.status && r.data.status !== "active") return { ok: false, error: `This Twilio account is ${r.data.status}. Reactivate it in Twilio first.` };
    return { ok: true, account: r.data?.friendly_name || "" };
  } catch (e) {
    return { ok: false, error: /timeout|abort/i.test(String(e?.name || e?.message)) ? "Twilio didn't answer in time. Try again in a minute." : "Couldn't reach Twilio. Try again in a minute." };
  }
}

// one WhatsApp message: plain text (body) or an approved template (contentSid + variables)
export async function sendWhatsapp(cfg, { to, body, contentSid, variables }) {
  const digits = normPhone(to);
  if (!digits) return { ok: false, error: "That isn't a phone number WhatsApp can use." };
  const from = normPhone(cfg.from);
  if (!from) return { ok: false, error: "The bot's WhatsApp number isn't set up." };
  const form = { From: waAddress(from), To: waAddress(digits) };
  if (contentSid) { form.ContentSid = contentSid; form.ContentVariables = JSON.stringify(variables || {}); }
  else form.Body = String(body || "").slice(0, 1600);
  try {
    const r = await call(cfg, "/Messages.json", { method: "POST", form });
    return r.ok ? { ok: true, sid: r.data?.sid || "" } : { ok: false, error: twilioError(r), code: r.data?.code };
  } catch {
    return { ok: false, error: "Couldn't reach Twilio. Try again in a minute." };
  }
}

// checks a Content SID is a template Twilio knows (and whether WhatsApp approved it)
export async function checkTemplate(cfg, contentSid) {
  if (!/^HX[0-9a-f]{32}$/i.test(contentSid || "")) return { ok: false, error: "A Content SID starts with HX followed by 32 letters and numbers." };
  try {
    const res = await fetch(`https://content.twilio.com/v1/Content/${contentSid}/ApprovalRequests`, {
      headers: { authorization: auth(cfg.accountSid, cfg.authToken) }, signal: AbortSignal.timeout(10_000), cache: "no-store",
    });
    if (res.status === 404) return { ok: false, error: "Twilio has no template with that Content SID on this account." };
    if (!res.ok) return { ok: true, status: "unknown" };
    const data = await res.json().catch(() => ({}));
    const status = data?.whatsapp?.status || "unsubmitted";
    return { ok: true, status };
  } catch {
    return { ok: true, status: "unknown" };
  }
}
