import { createHash } from "node:crypto";

// Meta Conversions API: the event we send, with personal details hashed
// (SHA-256, lower-case, trimmed) as Meta requires. Pure, so it can be tested.
export const GRAPH_VERSION = "v26.0";
const sha = (v) => createHash("sha256").update(v).digest("hex");
export const hashEmail = (e) => { const v = String(e || "").trim().toLowerCase(); return v ? sha(v) : null; };
export const hashPhone = (p) => { const v = String(p || "").replace(/\D/g, ""); return v.length >= 7 ? sha(v) : null; };
export const hashCountry = (c) => { const v = String(c || "").trim().toLowerCase(); return /^[a-z]{2}$/.test(v) ? sha(v) : null; };

export function capiEvent({ name, eventId, time = Date.now(), email, phone, country, fbc, fbp, ip, userAgent, url, value, currency }) {
  const user_data = {};
  const em = hashEmail(email), ph = hashPhone(phone), co = hashCountry(country);
  if (em) user_data.em = [em];
  if (ph) user_data.ph = [ph];
  if (co) user_data.country = [co];
  if (fbc) user_data.fbc = fbc;
  if (fbp) user_data.fbp = fbp;
  if (ip) user_data.client_ip_address = ip;
  if (userAgent) user_data.client_user_agent = userAgent;
  const event = { event_name: name, event_time: Math.floor(time / 1000), event_id: eventId, action_source: "website", user_data };
  if (url) event.event_source_url = url;
  if (value != null && currency) event.custom_data = { value: Math.round(Number(value) * 100) / 100, currency };
  return event;
}

// scheduled jobs: "Authorization: Bearer <CRON_SECRET>", compared in constant time
export function cronAuthorized(header, secret) {
  if (!secret || secret.length < 8) return false;
  const want = Buffer.from(`Bearer ${secret}`), got = Buffer.from(String(header || ""));
  if (want.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want[i] ^ got[i];
  return diff === 0;
}
