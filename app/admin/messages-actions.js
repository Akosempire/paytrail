"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { checkMessage } from "@/lib/admin-messages-core";
import { sendEmail } from "@/lib/email";
import { teamMessageEmail } from "@/lib/emails";
import { siteUrl } from "@/lib/site";

// Admin → a business → Message: the team writes to the business owner. It starts
// a conversation in their Ideas & help (so they can reply in the app) and emails
// them a copy. It also shows in Admin → Inbox with the rest of the conversations.
export async function sendBusinessMessage(businessId, input) {
  const ctx = await requirePlatformAdmin();
  const v = checkMessage(input || {});
  if (!v.ok) return { error: v.error };
  const service = createSupabaseService();
  const [{ data: business }, { data: owner }] = await Promise.all([
    service.from("businesses").select("id, name, email").eq("id", businessId).maybeSingle(),
    service.from("memberships").select("user_id, email, full_name").eq("business_id", businessId).eq("role", "owner").limit(1).maybeSingle(),
  ]);
  if (!business) return { error: "Business not found." };
  if (!owner?.user_id) return { error: "This business has no owner account to message." };
  const to = owner.email || business.email;
  const { data: thread, error } = await service.from("feedback_threads").insert({
    business_id: business.id, user_id: owner.user_id, author_name: String(owner.full_name || "").slice(0, 120), author_email: String(to || "").slice(0, 200),
    kind: "other", subject: v.subject, status: "open", page: "Message from the Usetally team", unread_user: true, unread_admin: false,
  }).select("id").single();
  if (error) return { error: /feedback_threads/.test(error.message || "") ? "Messages need the Ideas & help database update (RUN_NEW_2026-10-29_ALL.sql)." : "Couldn't send the message. Try again." };
  const { error: e2 } = await service.from("feedback_messages").insert({ thread_id: thread.id, author_id: ctx.user.id, from_team: true, body: v.body });
  if (e2) {
    await service.from("feedback_threads").delete().eq("id", thread.id);
    return { error: "Couldn't send the message. Try again." };
  }
  if (to) {
    const { data: settings } = await service.from("platform_settings").select("support_email").eq("id", true).maybeSingle();
    after(() => sendEmail({ to, replyTo: settings?.support_email || undefined, ...teamMessageEmail({ subject: v.subject, body: v.body, link: `${siteUrl()}/app/feedback/${thread.id}` }) })
      .catch((e) => console.error("admin_message.email_failed", { message: String(e?.message || e).slice(0, 200) })));
  }
  revalidatePath(`/admin/businesses/${business.id}`);
  revalidatePath("/admin/inbox");
  return { ok: true, threadId: thread.id, to: to || null, message: to ? `Sent to ${to}. It's also in their Ideas & help.` : "Sent to their Ideas & help (no email on file)." };
}
