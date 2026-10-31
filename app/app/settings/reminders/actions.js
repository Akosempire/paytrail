"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/context";
import { checkRule } from "@/lib/reminders-core";

const SQL_HINT = "Reminders need the latest database update: run RUN_NEW_2026-11-01c.sql in Supabase first.";
const notReady = (e) => /(reminder|email_template_invoice|reminders_enabled)/.test(e?.message || "");
const done = () => { revalidatePath("/app/settings/reminders"); };

export async function setRemindersEnabled(on) {
  const ctx = await requirePermission("settings.business");
  const { error } = await ctx.supabase.from("businesses").update({ reminders_enabled: Boolean(on) }).eq("id", ctx.business.id);
  if (error) return { error: notReady(error) ? SQL_HINT : "Could not save." };
  done();
  return { message: on ? "Reminders are on." : "Reminders are off. Nothing will be sent automatically." };
}

// one rule: create (no id) or update; checkRule keeps it sensible
export async function saveReminderRule(id, rule) {
  const ctx = await requirePermission("settings.business");
  const v = checkRule(rule);
  if (!v.ok) return { error: v.error };
  const row = { offset_days: v.value.offset_days, enabled: v.value.enabled, subject: v.value.subject, message: v.value.message, updated_at: new Date().toISOString() };
  const { error } = id
    ? await ctx.supabase.from("reminder_rules").update(row).eq("id", id).eq("business_id", ctx.business.id)
    : await ctx.supabase.from("reminder_rules").insert({ ...row, business_id: ctx.business.id });
  if (error) {
    if (error.code === "23505") return { error: "There's already a reminder for that day." };
    return { error: notReady(error) ? SQL_HINT : "Could not save the reminder." };
  }
  done();
  return { message: "Reminder saved." };
}

export async function toggleReminderRule(id, enabled) {
  const ctx = await requirePermission("settings.business");
  const { error } = await ctx.supabase.from("reminder_rules").update({ enabled: Boolean(enabled), updated_at: new Date().toISOString() }).eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { error: "Could not save." };
  done();
  return { message: enabled ? "Reminder on." : "Reminder off." };
}

export async function deleteReminderRule(id) {
  const ctx = await requirePermission("settings.business");
  const { error } = await ctx.supabase.from("reminder_rules").delete().eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { error: "Could not remove the reminder." };
  done();
  return { message: "Reminder removed." };
}

// the default message sent with a new invoice (the send sheet reads it)
export async function saveInvoiceEmail(text) {
  const ctx = await requirePermission("settings.business");
  const value = String(text || "").replace(/\r\n/g, "\n").trim().slice(0, 2000);
  if (value && !value.includes("{link}")) return { error: "Keep {link} in the message so your customer can open the invoice." };
  const { error } = await ctx.supabase.from("businesses").update({ email_template_invoice: value }).eq("id", ctx.business.id);
  if (error) return { error: notReady(error) ? SQL_HINT : "Could not save." };
  revalidatePath("/app", "layout");
  return { message: value ? "Invoice email saved." : "Back to the standard invoice email." };
}
