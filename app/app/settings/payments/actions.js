"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { encryptSecret, hint } from "@/lib/crypto";
import { KEY_RULES, webhookSecretProblem } from "@/lib/payments/keys";
import { confirmAttempt, startCheckout, testAmountMinor, PROVIDERS } from "@/lib/payments";

const done = () => revalidatePath("/app/settings/payments");

export async function saveConnection(provider, { secretKey, webhookSecret }) {
  const ctx = await requirePermission("settings.payments");
  if (!PROVIDERS[provider]) return { error: "Unknown provider." };
  const key = String(secretKey || "").trim();
  const hook = String(webhookSecret || "").trim();
  const service = createSupabaseService();
  const { data: existing } = await service.from("payment_connections").select("secret_key_enc, webhook_secret_enc, mode").eq("business_id", ctx.business.id).eq("provider", provider).maybeSingle();

  const update = { business_id: ctx.business.id, provider, updated_at: new Date().toISOString(), last_error: "" };
  const rule = KEY_RULES[provider];
  if (key) {
    if (!rule.valid(key)) return { error: rule.badKey };
    const check = await rule.check(key);
    if (!check.ok) return { error: check.error };
    Object.assign(update, { secret_key_enc: encryptSecret(key), key_hint: hint(key), mode: rule.mode(key) });
    // a new key (or a switch between test and live) must be proven again
    Object.assign(update, { payment_confirmed_at: null, webhook_confirmed_at: null, last_test_reference: null });
    // Paystack signs webhooks with the secret key itself
    if (!rule.needsWebhookSecret) update.webhook_secret_enc = update.secret_key_enc;
  } else if (!existing?.secret_key_enc) {
    return { error: "Paste your secret key." };
  }
  if (rule.needsWebhookSecret) {
    if (hook) {
      const problem = webhookSecretProblem(provider, hook);
      if (problem) return { error: problem };
      update.webhook_secret_enc = encryptSecret(hook);
      update.webhook_confirmed_at = null;
    } else if (!existing?.webhook_secret_enc) {
      return { error: rule.badHook.replace(/^Use a/, "Enter a").replace(/^Paste the full/, "Paste the") };
    }
  }
  const { error } = await service.from("payment_connections").upsert(update, { onConflict: "business_id,provider" });
  if (error) return { error: "Could not save. Try again." };
  await service.from("activity").insert({ business_id: ctx.business.id, actor_id: ctx.user.id, actor_label: ctx.member.full_name || ctx.user.email, action: "payments.keys_saved", detail: { provider, mode: update.mode || existing?.mode } });
  done();
  return { message: `${PROVIDERS[provider].name} keys saved and accepted. Now run a test payment.` };
}

export async function runTestPayment(provider) {
  const ctx = await requirePermission("settings.payments");
  try {
    const { url, reference } = await startCheckout({
      businessId: ctx.business.id, provider, purpose: "connection_test", amountMinor: testAmountMinor(ctx.business.currency), currency: ctx.business.currency,
      customer: { email: ctx.user.email, name: ctx.member.full_name || ctx.business.name },
      brand: { name: ctx.business.name, logo: ctx.business.logo_path, description: "PayTrail connection test" },
    });
    await createSupabaseService().from("payment_connections").update({ last_test_reference: reference }).eq("business_id", ctx.business.id).eq("provider", provider);
    return { url };
  } catch (e) {
    await createSupabaseService().from("payment_connections").update({ last_error: e.message.slice(0, 300) }).eq("business_id", ctx.business.id).eq("provider", provider);
    done();
    return { error: e.message };
  }
}

export async function recheckConnection(provider) {
  const ctx = await requirePermission("settings.payments");
  const service = createSupabaseService();
  const { data } = await service.from("payment_connections").select("last_test_reference").eq("business_id", ctx.business.id).eq("provider", provider).maybeSingle();
  if (!data?.last_test_reference) return { error: "Run a test payment first." };
  const r = await confirmAttempt(data.last_test_reference).catch((e) => ({ state: "error", error: e.message }));
  done();
  if (r.state === "succeeded") return { message: "Test payment confirmed." };
  if (r.state === "failed") return { error: "The test payment failed or was cancelled. Try again." };
  if (r.state === "error") return { error: r.error };
  return { message: "Still waiting for the provider to confirm." };
}

export async function setEnabled(provider, enabled) {
  const ctx = await requirePermission("settings.payments");
  await createSupabaseService().from("payment_connections").update({ enabled: Boolean(enabled), updated_at: new Date().toISOString() }).eq("business_id", ctx.business.id).eq("provider", provider);
  done();
  return { message: enabled ? "Customers can pay with it again." : "Turned off. Customers won't see this option." };
}

export async function disconnect(provider) {
  const ctx = await requirePermission("settings.payments");
  await createSupabaseService().from("payment_connections").delete().eq("business_id", ctx.business.id).eq("provider", provider);
  done();
  return { message: `${PROVIDERS[provider].name} disconnected and its keys deleted.` };
}
