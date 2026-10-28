"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContext } from "@/lib/context";
import { businessFieldsFrom, dropTax2IfNotReady, uploadLogo } from "@/lib/business";
import { inviteMember } from "@/lib/team";
import { notifyAdmins } from "@/lib/admin-alerts";

async function pendingBusiness() {
  const ctx = await getContext();
  if (!ctx.user) redirect("/login?next=/onboarding");
  return ctx;
}

export async function startBusiness(_prev, form) {
  const ctx = await pendingBusiness();
  const kind = form.get("kind") === "company" ? "company" : "freelancer";
  const name = String(form.get("name") || "").trim();
  const ownerName = String(form.get("owner_name") || ctx.user.user_metadata?.full_name || "").trim();
  if (!name) return { error: kind === "company" ? "Enter your company name." : "Enter the name you trade under." };
  // the country decides which tax features show (e.g. Nigeria's VAT returns), so it's required
  const country = String(form.get("country") || "").trim().slice(0, 60);
  if (!country) return { error: "Choose your country." };
  const { data: id, error } = await ctx.supabase.rpc("create_business", {
    business_kind: kind, business_name: name, owner_name: ownerName, business_currency: String(form.get("currency") || "NGN"),
  });
  if (error) return { error: error.message };
  const fields = businessFieldsFrom(form, ["legal_name", "email", "phone", "website", "address", "city", "country", "tax_id", "region"]);
  fields.country = country;
  // the country's tax names (VAT, GST, GST + PST in British Columbia…); the
  // rates stay 0 until the owner says they charge tax, in the money step
  const { countryByName } = await import("@/lib/countries");
  const { presetFields } = await import("@/lib/tax-presets");
  const known = countryByName(country);
  if (known) fields.tax_label = known.tax;
  const preset = known ? presetFields(known.code, fields.region) : null;
  if (preset) { fields.tax_label = preset.tax_label; fields.tax2_label = preset.tax2_label; }
  const { data: row } = await ctx.supabase.from("businesses").select("*").eq("id", id).single();
  dropTax2IfNotReady(fields, row);
  await ctx.supabase.from("businesses").update(fields).eq("id", id);
  // which ad this business came from, and tell Meta (never blocks sign-up)
  const { recordSignup } = await import("@/lib/marketing-events");
  await recordSignup({ businessId: id, email: fields.email || ctx.user.email, phone: fields.phone, countryCode: known?.code, trialStarted: row?.subscription_status === "trialing" && Boolean(row?.trial_ends_at) });
  redirect("/onboarding?step=brand");
}

export async function saveBrand(_prev, form) {
  const ctx = await pendingBusiness();
  const id = String(form.get("business_id"));
  const fields = businessFieldsFrom(form, ["brand_color", "footer_note"]);
  const logo = await uploadLogo(ctx.supabase, id, form.get("logo"));
  if (logo.error) return { error: logo.error };
  if (logo.path) fields.logo_path = logo.path;
  const { error } = await ctx.supabase.from("businesses").update(fields).eq("id", id);
  if (error) return { error: "Could not save your branding." };
  redirect("/onboarding?step=money");
}

export async function saveMoney(_prev, form) {
  const ctx = await pendingBusiness();
  const id = String(form.get("business_id"));
  const fields = businessFieldsFrom(form, ["currency", "tax_label", "tax_rate", "tax2_label", "tax2_rate", "quote_validity_days", "invoice_due_days",
    "quote_prefix", "invoice_prefix", "receipt_prefix", "bank_name", "bank_account_name", "bank_account_number", "default_terms"]);
  const { data: row } = await ctx.supabase.from("businesses").select("*").eq("id", id).single();
  const taxGate = dropTax2IfNotReady(fields, row);
  if (taxGate) return taxGate;
  const { error } = await ctx.supabase.from("businesses").update(fields).eq("id", id);
  if (error) return { error: "Could not save these settings." };
  redirect("/onboarding?step=finish");
}

export async function finishOnboarding(_prev, form) {
  const ctx = await pendingBusiness();
  const id = String(form.get("business_id"));
  const { data: business } = await ctx.supabase.from("businesses").select("*").eq("id", id).single();
  const mine = ctx.memberships.find((m) => m.business_id === id);
  if (!business || mine?.role !== "owner") return { error: "Only the owner can finish setting up this business." };
  const results = [];
  if (business?.kind === "company") {
    const emails = String(form.get("invites") || "").split(/[\s,;]+/).filter(Boolean).slice(0, 10);
    const role = String(form.get("invite_role") || "finance");
    const scoped = { ...ctx, business, member: { role: "owner", full_name: ctx.user.user_metadata?.full_name || "" } };
    for (const email of emails) results.push(await inviteMember(scoped, { email, role, canViewCosts: role !== "junior_finance" }));
    const failed = results.find((r) => r.error);
    if (failed) return { error: failed.error };
  }
  await ctx.supabase.from("businesses").update({ onboarded_at: new Date().toISOString() }).eq("id", id);
  await ctx.supabase.from("profiles").upsert({ user_id: ctx.user.id, active_business_id: id });
  if (!business.onboarded_at) await notifyAdmins({
    subject: `New business: ${business.name}`,
    lines: [
      `${ctx.user.user_metadata?.full_name || "Someone"} (${ctx.user.email}) just set up ${business.name}.`,
      `${business.kind === "company" ? "Company" : "Freelancer"} · ${business.country || "country not set"} · ${business.currency} · on the free trial.`,
    ],
    link: "/admin/businesses",
  });
  revalidatePath("/", "layout");
  const next = form.get("next") === "payments" ? "/app/settings/payments?welcome=1" : "/app?welcome=1";
  redirect(next);
}
