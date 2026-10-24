import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { confirmAttempt, credentialsFor } from "@/lib/payments";
import { validBachsSignature } from "@/lib/payments/bachs";
import { validFlutterwaveHash } from "@/lib/payments/flutterwave";
import { validStripeSignature } from "@/lib/payments/stripe";
import { validPaystackSignature } from "@/lib/payments/paystack";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

// One URL per business (or "platform" for Usetally's own billing). The signature
// is checked with that owner's secret; the payment itself is then re-verified
// with the provider's API before anything is recorded.
export async function handleWebhook(request, provider, owner) {
  const businessId = owner === "platform" ? null : owner;
  if (businessId && !UUID.test(businessId)) return new Response("Not found", { status: 404 });
  const raw = await request.text();
  const service = createSupabaseService();
  const creds = await credentialsFor(service, businessId, provider).catch(() => null);
  if (!creds?.webhookSecret) return new Response("Not configured", { status: 404 });

  const h = (name) => request.headers.get(name);
  const valid = {
    bachs: () => validBachsSignature(raw, h("x-bachs-timestamp"), h("x-bachs-signature"), creds.webhookSecret),
    flutterwave: () => validFlutterwaveHash(h("verif-hash"), creds.webhookSecret),
    stripe: () => validStripeSignature(raw, h("stripe-signature"), creds.webhookSecret),
    // Paystack signs with the secret key itself
    paystack: () => validPaystackSignature(raw, h("x-paystack-signature"), creds.secretKey),
  }[provider]?.() ?? false;
  if (!valid) {
    console.error("webhook.rejected", { provider, owner });
    return new Response("Invalid signature", { status: 401 });
  }

  let event;
  try { event = JSON.parse(raw); } catch { return new Response("Bad payload", { status: 400 }); }
  // Stripe nests the object one level deeper (event.data.object)
  const data = event.data?.object || event.data || {};
  const eventId = String(event.id || data.id || `${provider}-${data.tx_ref || data.reference || ""}-${event.type || event.event || ""}`);
  const eventType = String(event.type || event.event || event["event.type"] || "");

  // proves the webhook is wired up correctly, which the setup guide waits for
  if (businessId) {
    const now = new Date().toISOString();
    await service.from("payment_connections").update({ webhook_confirmed_at: now, last_event_at: now }).eq("business_id", businessId).eq("provider", provider);
  }
  const { error: dup } = await service.from("webhook_events").insert({ provider, event_id: eventId, business_id: businessId, event_type: eventType });
  const reference = String(data.client_reference_id || data.reference || data.tx_ref || data.metadata?.paytrail_reference || data.meta?.paytrail_reference || "");
  if (!reference) return new Response("OK");
  if (dup && !/collection\.succeeded|charge\.completed|charge\.success|checkout\.session\.(completed|async_payment_succeeded)/.test(eventType)) return new Response("OK");

  try {
    const result = await confirmAttempt(reference, { fromWebhook: true });
    console.info("webhook.processed", { provider, reference, state: result.state });
    return new Response("OK");
  } catch (e) {
    // a 500 makes the provider retry later
    console.error("webhook.failed", { provider, reference, message: e.message });
    return new Response("Processing failed", { status: 500 });
  }
}
