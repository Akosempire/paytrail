"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/context";
import { businessFieldsFrom, uploadLogo } from "@/lib/business";
import { requireStepUp } from "@/lib/step-up";

export async function updateBusiness(_prev, form) {
  const ctx = await requirePermission("settings.business");
  const fields = businessFieldsFrom(form, ["name", "legal_name", "email", "phone", "website", "address", "city", "country", "tax_id",
    "brand_color", "footer_note", "currency", "tax_label", "tax_rate", "quote_validity_days", "invoice_due_days",
    "quote_prefix", "invoice_prefix", "receipt_prefix", "bank_name", "bank_account_name", "bank_account_number", "default_terms",
    ...(ctx.business.kind === "company" ? ["require_approval"] : [])]);
  if (fields.name === "") return { error: "Business name can't be empty." };
  const bankChanged = ["bank_name", "bank_account_name", "bank_account_number"].some((k) => k in fields && String(fields[k] ?? "") !== String(ctx.business[k] ?? ""));
  if (bankChanged) {
    const gate = await requireStepUp(ctx, "bank_details", ctx.business.id);
    if (gate) return gate;
  }
  const logo = await uploadLogo(ctx.supabase, ctx.business.id, form.get("logo"));
  if (logo.error) return { error: logo.error };
  if (logo.path) fields.logo_path = logo.path;
  if (form.get("remove_logo") === "on") fields.logo_path = null;
  const { error } = await ctx.supabase.from("businesses").update(fields).eq("id", ctx.business.id);
  if (error) return /STEP_UP/.test(error.message) ? { stepUp: "bank_details" } : { error: "Could not save. Check the details and try again." };
  revalidatePath("/app", "layout");
  return { message: "Settings saved." };
}
