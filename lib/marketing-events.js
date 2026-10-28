import "server-only";
import { after } from "next/server";
import { createSupabaseService } from "@/lib/supabase/server";
import { readAttribution, queueBrowserEvents } from "@/lib/attribution";
import { fbcFrom } from "@/lib/attribution-core";
import { countryCode } from "@/lib/einvoice";
import { sendMetaEvents } from "@/lib/meta";
import { siteUrl } from "@/lib/site";

// Sign-ups and payments for Admin → Marketing and Meta. Nothing here may
// stop a sign-up or a payment: every failure is logged and swallowed.

// a business was just created: save which ad it came from, then tell Meta
// (CompleteRegistration, and StartTrial when the free trial starts)
export async function recordSignup({ businessId, email, phone, countryCode: cc, trialStarted }) {
  try {
    const { fields, url } = await readAttribution();
    if (!fields.fbc && fields.fbclid) fields.fbc = fbcFrom(fields.fbclid, Date.parse(fields.landed_at || "") || Date.now());
    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      // with the service key: members can't set these themselves
      const { error } = await createSupabaseService().from("businesses").update(fields).eq("id", businessId);
      if (error) console.warn("attribution.not_saved", { message: error.message }); // the marketing SQL hasn't run yet
    }
    const base = { email, phone, country: cc, fbc: fields.fbc, fbp: fields.fbp, ip: fields.attr_ip, userAgent: fields.attr_user_agent, url: url || `${siteUrl()}/onboarding` };
    const events = [{ ...base, name: "CompleteRegistration", eventId: `reg-${businessId}` }];
    if (trialStarted) events.push({ ...base, name: "StartTrial", eventId: `trial-${businessId}`, value: 0, currency: "USD" });
    await queueBrowserEvents(events);
    after(() => sendMetaEvents(events).catch(() => {}));
  } catch (e) {
    console.error("marketing.signup_not_recorded", { message: e.message });
  }
}

// a paid plan payment succeeded (billing webhook or re-check): Purchase
export async function recordPurchase(attempt) {
  try {
    if (!Number(attempt?.amount_minor)) return;
    const service = createSupabaseService();
    const { data: b } = await service.from("businesses").select("*").eq("id", attempt.business_id).maybeSingle();
    if (!b) return;
    let email = b.email;
    if (!email) {
      const { data: owner } = await service.from("memberships").select("email").eq("business_id", b.id).eq("role", "owner").limit(1).maybeSingle();
      email = owner?.email || "";
    }
    await sendMetaEvents([{
      name: "Purchase", eventId: `purchase-${attempt.id}`, email, phone: b.phone, country: countryCode(b.country),
      fbc: b.fbc, fbp: b.fbp, ip: b.attr_ip, userAgent: b.attr_user_agent, url: `${siteUrl()}/app/settings/billing`,
      value: Number(attempt.amount_minor) / 100, currency: attempt.currency,
    }]);
  } catch (e) {
    console.error("marketing.purchase_not_recorded", { message: e.message });
  }
}
