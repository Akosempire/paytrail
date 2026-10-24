"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/context";
import { toMinor } from "@/lib/money";

export async function addPreset(form) {
  const ctx = await requirePermission("costs.view");
  const amount = toMinor(form.amount);
  if (!String(form.label || "").trim()) return { error: "Name the cost." };
  if (!Number.isFinite(amount)) return { error: "Check the amount." };
  const { error } = await ctx.supabase.from("cost_presets").insert({ business_id: ctx.business.id, label: String(form.label).trim().slice(0, 120), category: form.category || "other", amount_minor: amount });
  if (error) return { error: "Could not save." };
  revalidatePath("/app/settings/costs");
  return { message: "Preset added." };
}

export async function deletePreset(id) {
  const ctx = await requirePermission("costs.view");
  await ctx.supabase.from("cost_presets").delete().eq("id", id).eq("business_id", ctx.business.id);
  revalidatePath("/app/settings/costs");
  return { message: "Preset removed." };
}
