"use server";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { can } from "@/lib/permissions";
import { toMinor } from "@/lib/money";
import { createSupabaseService } from "@/lib/supabase/server";
import { inNigeria } from "@/lib/einvoice";
import { ensureReturn, markDone, markFiled, requestFiling, saveReturnFile } from "@/lib/vat-returns";

// The business's side of a monthly VAT return: ask Usetally to file it, or
// file it yourself; then mark it paid with the receipt.
async function guard(period) {
  const ctx = await requireBusiness();
  if (!can(ctx.member, "payments.record")) return { error: "Only owners, managers and finance officers can handle VAT returns." };
  if (!inNigeria(ctx.business)) return { error: "VAT returns here are for businesses in Nigeria. Check your country in Settings → Business & branding." };
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(period))) return { error: "Choose a month." };
  const now = new Date(), cur = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (period > cur) return { error: "That month hasn't happened yet." };
  return { ctx };
}
const who = (ctx) => ctx.member.full_name || ctx.user.email;
const done = (period, r) => { revalidatePath("/app/tax"); return r; };
const safe = async (fn) => { try { return await fn(); } catch (e) { return { error: String(e?.message || "Something went wrong. Try again.").slice(0, 300) }; } };

export async function requestVatFiling(period, note) {
  return safe(async () => {
    const g = await guard(period); if (g.error) return g;
    return done(period, await requestFiling(g.ctx, period, note));
  });
}

export async function fileVatMyself(period, form) {
  return safe(async () => {
    const g = await guard(period); if (g.error) return g;
    const service = createSupabaseService();
    const ret = await ensureReturn(service, g.ctx.business, period);
    if (!["to_file", "requested"].includes(ret.status)) return { error: "This return is already filed." };
    const amount = form.get("amount") ? toMinor(form.get("amount")) : ret.vat_minor;
    if (!Number.isFinite(amount) || amount < 0) return { error: "Check the amount to pay." };
    const file = await saveReturnFile(service, ret, "acknowledgement", form.get("file"), who(g.ctx));
    if (file.error) return file;
    const r = await markFiled(service, ret, { reference: form.get("reference"), amountDue: amount, paymentReference: form.get("paymentReference"), by: who(g.ctx) });
    if (r.error) return r;
    await service.from("vat_returns").update({ mode: ret.mode === "assisted" ? "assisted" : "self" }).eq("id", ret.id);
    return done(period, { message: "Marked as filed. Once it's paid, tap \"I've paid\" and add the receipt." });
  });
}

export async function markVatPaid(period, form) {
  return safe(async () => {
    const g = await guard(period); if (g.error) return g;
    const service = createSupabaseService();
    const ret = await ensureReturn(service, g.ctx.business, period);
    if (ret.status !== "filed") return { error: "File the return first." };
    const file = await saveReturnFile(service, ret, "payment_receipt", form.get("file"), who(g.ctx));
    if (file.error) return file;
    const r = await markDone(service, ret);
    return r.error ? r : done(period, { message: "Done. The receipt is kept with this month." });
  });
}
