"use server";
import { requirePermission } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { startCheckout } from "@/lib/payments";
import { subscriptionCurrencyFor } from "@/lib/plans";
import { offerEligible, offerPrice } from "@/lib/trial-offer";

export async function choosePlan(planId) {
  const ctx = await requirePermission("settings.billing");
  const service = createSupabaseService();
  const [{ data: plan }, { data: settings }] = await Promise.all([
    // hidden plans (e.g. founding prices) can only be renewed by businesses already on them
    service.from("plans").select("*").eq("id", planId).maybeSingle(),
    service.from("platform_settings").select("billing_provider, support_email").eq("id", true).single(),
  ]);
  // a hidden offer with spots (e.g. Founding) can be chosen while spots are left
  const spotsLeft = plan && !plan.active && plan.spots != null ? (await service.rpc("plan_spots_left", { plan: plan.id })).data : null;
  if (!plan || (!plan.active && !(ctx.business.plan_id === plan.id && ctx.business.subscription_status === "active") && !(spotsLeft > 0))) return { error: plan?.spots != null ? "All the founding spots are taken." : "That plan is no longer available." };
  if (ctx.business.kind === "company" && !plan.allow_company) return { error: "This plan is for freelancers. Choose a team plan." };
  // naira plans are for Nigerian businesses, dollar plans for everyone else
  // (a business already on a plan can keep renewing it)
  const isCurrent = ctx.business.plan_id === plan.id;
  if (plan.price_minor > 0 && !isCurrent && plan.currency !== subscriptionCurrencyFor(ctx.business)) {
    return { error: plan.currency === "NGN" ? "Naira plans are for businesses in Nigeria. Choose a dollar plan." : "Businesses in Nigeria pay in naira. Choose a naira plan." };
  }
  if (plan.price_minor === 0) {
    const { error } = await service.rpc("extend_subscription", { target: ctx.business.id, new_plan: plan.id, pay_method: "free", pay_reference: "", pay_amount: 0, pay_currency: plan.currency, recorder: ctx.user.id });
    return error ? { error: error.message } : { message: `You're on ${plan.name}.` };
  }
  // pay before the trial ends: 25% off a yearly plan (first payment only, checked here)
  let amountMinor = Number(plan.price_minor);
  const discounted = offerPrice(plan);
  if (discounted != null) {
    const { count } = await service.from("subscription_payments").select("id", { count: "exact", head: true }).eq("business_id", ctx.business.id).gt("amount_minor", 0);
    if (offerEligible({ business: ctx.business, paidBefore: (count || 0) > 0 })) amountMinor = discounted;
  }
  if (settings.billing_provider === "manual") {
    return { manual: true, email: settings.support_email };
  }
  try {
    const { url } = await startCheckout({
      billingBusinessId: ctx.business.id, provider: settings.billing_provider, purpose: "subscription", planId: plan.id,
      amountMinor, currency: plan.currency,
      customer: { email: ctx.business.email || ctx.user.email, name: ctx.business.name },
      brand: { name: "Usetally", description: `${plan.name} plan${amountMinor < Number(plan.price_minor) ? " (25% off your first year)" : ""}` },
    });
    return { url };
  } catch (e) {
    return { error: `Payment couldn't start: ${e.message}` };
  }
}
