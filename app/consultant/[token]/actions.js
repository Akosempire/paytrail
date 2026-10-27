"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseService } from "@/lib/supabase/server";
import { toMinor, formatMoney } from "@/lib/money";
import { monthOf } from "@/lib/tax";
import { markFiled, notifyFiled, saveReturnFile } from "@/lib/vat-returns";
import { consultantFor } from "./lookup";

// the consultant records the filing: references, the amount to pay, the acknowledgement
export async function recordFiling(token, returnId, form) {
  try {
    const c = await consultantFor(token);
    if (!c) return { error: "This link no longer works. Ask Usetally for a new one." };
    const service = createSupabaseService();
    const { data: ret } = await service.from("vat_returns").select("*").eq("id", returnId).eq("consultant_id", c.id).maybeSingle();
    if (!ret) return { error: "That request isn't assigned to you." };
    if (!["requested", "to_file"].includes(ret.status)) return { error: "This return is already marked as filed." };
    const amount = toMinor(form.get("amount"));
    if (!Number.isFinite(amount) || amount < 0) return { error: "Enter the amount the business has to pay (0 for a nil return)." };
    const by = `${c.name} (tax consultant)`;
    const file = await saveReturnFile(service, ret, "acknowledgement", form.get("file"), by);
    if (file.error) return file;
    const r = await markFiled(service, ret, { reference: form.get("reference"), amountDue: amount, paymentReference: form.get("paymentReference"), by });
    if (r.error) return r;
    const { data: business } = await service.from("businesses").select("*").eq("id", ret.business_id).maybeSingle();
    const updated = { ...ret, payment_reference: String(form.get("paymentReference") || "") };
    await notifyFiled(service, updated, business, { amount, by: c.name });
    const { notifyAdmins } = await import("@/lib/admin-alerts");
    await notifyAdmins({ subject: `VAT filed: ${business.name}, ${monthOf(ret.period).label}`, heading: "A VAT return was filed", lines: [`${c.name} filed ${business.name}'s ${monthOf(ret.period).label} VAT return.`, `To pay: ${formatMoney(amount, ret.currency)}${updated.payment_reference ? ` · ref ${updated.payment_reference}` : ""}`], link: "/admin/tax?tab=filed" }).catch(() => {});
    revalidatePath(`/consultant/${token}`);
    return { message: `Recorded. ${business.name} has been emailed the amount and payment reference.` };
  } catch (e) {
    return { error: String(e?.message || "Something went wrong. Try again.").slice(0, 200) };
  }
}
