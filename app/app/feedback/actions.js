"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendlyError, requireBusiness } from "@/lib/context";
import { checkNewThread, checkReply } from "@/lib/feedback-core";
import { alertTeam } from "@/lib/feedback";

const NEEDS_SQL = "Ideas & help needs a database update. Run RUN_NEW_2026-10-29b.sql in Supabase, then try again.";

// Ideas & help → New message
export async function startThread(_prev, form) {
  const ctx = await requireBusiness();
  const v = checkNewThread({ kind: form.get("kind"), subject: form.get("subject"), body: form.get("body"), page: form.get("page") });
  if (!v.ok) return { error: v.error };
  const { data: id, error } = await ctx.supabase.rpc("feedback_start", { target: ctx.business.id, kind: v.value.kind, subject: v.value.subject, body: v.value.body, page: v.value.page });
  if (error) return { error: /feedback_start/.test(error.message || "") ? NEEDS_SQL : friendlyError(error) };
  after(() => alertTeam({ threadId: id, ...v.value, name: ctx.member.full_name, email: ctx.user.email, business: ctx.business.name, isNew: true }));
  revalidatePath("/app/feedback");
  redirect(`/app/feedback/${id}?sent=1`);
}

// the person writes again in their thread
export async function replyToThread(threadId, _prev, form) {
  const ctx = await requireBusiness();
  const v = checkReply(form.get("body"));
  if (!v.ok) return { error: v.error };
  const { data, error } = await ctx.supabase.rpc("feedback_reply", { thread: String(threadId), body: v.value });
  if (error) return { error: friendlyError(error) };
  if (!data?.from_team) {
    after(() => alertTeam({ threadId, subject: data?.subject || "", body: v.value, name: ctx.member.full_name, email: ctx.user.email, business: ctx.business.name, isNew: false }));
  }
  revalidatePath(`/app/feedback/${threadId}`);
  revalidatePath("/app/feedback");
  return { message: "Sent. We'll email you when we reply.", ok: Date.now() };
}
