"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { friendlyError, requirePlatformAdmin } from "@/lib/context";
import { checkReply, STATUSES } from "@/lib/feedback-core";
import { emailPerson } from "@/lib/feedback";

// Admin → Inbox: the team answers. The person gets an email with the reply.
export async function teamReply(threadId, _prev, form) {
  const ctx = await requirePlatformAdmin();
  const v = checkReply(form.get("body"));
  if (!v.ok) return { error: v.error };
  const { data, error } = await ctx.supabase.rpc("feedback_reply", { thread: String(threadId), body: v.value });
  if (error) return { error: friendlyError(error) };
  if (data?.from_team) after(() => emailPerson({ threadId, to: data.email, name: data.name, subject: data.subject, reply: v.value }));
  const status = String(form.get("status") || "");
  if (STATUSES[status]) await ctx.supabase.rpc("feedback_set_status", { thread: String(threadId), new_status: status });
  revalidatePath(`/admin/inbox/${threadId}`);
  revalidatePath("/admin/inbox");
  return { message: data?.from_team ? "Reply sent. They'll get it by email too." : "Added.", ok: Date.now() };
}

export async function setThreadStatus(threadId, status) {
  const ctx = await requirePlatformAdmin();
  if (!STATUSES[status]) return { error: "Unknown status" };
  const { error } = await ctx.supabase.rpc("feedback_set_status", { thread: String(threadId), new_status: status });
  revalidatePath(`/admin/inbox/${threadId}`);
  revalidatePath("/admin/inbox");
  return error ? { error: friendlyError(error) } : { message: `Marked ${STATUSES[status].label.toLowerCase()}.` };
}
