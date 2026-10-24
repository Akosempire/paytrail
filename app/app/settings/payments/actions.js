"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { encryptSecret, hint } from "@/lib/crypto";
import { bachsMode, testBachsKey, validBachsKey } from "@/lib/payments/bachs";
import { flutterwaveMode, testFlutterwaveKey, validFlutterwaveKey } from "@/lib/payments/flutterwave";
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
  if (key) {
    if (provider === "bachs" && !validBachsKey(key)) return { error: "That doesn't look like a Bachs secret key. It starts with sk_sandbox_ (test) or sk_live_ (live)." };
    if (provider === "flutterwave" && !validFlutterwaveKey(key)) return { error: "That doesn't look like a Flutterwave secret key. It starts with FLWSECK_TEST- (test) or FLWSECK- (live)." };
    const check = provider === "bachs" ? await testBachsKey(key) : await testFlutterwaveKey(key);
    if (!check.ok) return { error: check.error };
    const mode = provider === "bachs" ? bachsMode(key) : flutterwaveMode(key);
    Object.assign(update, { secret_key_enc: encryptSecret(key), key_hint: hint(key), mode });
    // a new key (or a switch between test and live) must be proven again
    Object.assign(update, { payment_confirmed_at: null, webhook_confirmed_at: null, last_test_reference: null });
  } else if (!existing?.secret_key_enc) {
    return { error: "Paste your secret key." };
  }
  if (hook) {
    if (hook.length < 8) return { error: provider === "bachs" ? "Paste the full webhook signing secret from Bachs." : "Use a secret hash of at least 8 characters." };
    update.webhook_secret_enc = encryptSecret(hook);
    update.webhook_confirmed_at = null;
  } else if (!existing?.webhook_secret_enc) {
    return { error: provider === "bachs" ? "Paste your webhook signing secret." : "Enter the secret hash you set in Flutterwave." };
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
