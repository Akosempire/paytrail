"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/context";
import { businessFieldsFrom } from "@/lib/business";

// "Fix" on the invoice page's e-invoicing line: saves only the business
// details e-invoicing needs (tax ID, address, city, country, postcode).
// Kept apart from Settings' updateBusiness, which expects the whole form.
export async function saveEInvoiceDetails(form) {
  const ctx = await requirePermission("settings.business");
  const fields = businessFieldsFrom(form, ["tax_id", "address", "city", "country"]);
  for (const [k, v] of Object.entries(fields)) if (v === "" || v == null) delete fields[k];
  if (form.has("postcode") && String(form.get("postcode") || "").trim() && "postcode" in ctx.business) {
    const { postcodeFields } = await import("@/lib/postcode-server");
    const pc = await postcodeFields(form.get("postcode"));
    if (pc.error) return { error: pc.error };
    Object.assign(fields, pc.fields);
  }
  if (!Object.keys(fields).length) return { error: "Fill in at least one detail." };
  const { error } = await ctx.supabase.from("businesses").update(fields).eq("id", ctx.business.id);
  if (error) return { error: "Could not save. Check the details and try again." };
  revalidatePath("/app", "layout");
  return { message: "Saved." };
}
