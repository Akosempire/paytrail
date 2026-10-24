"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireBusiness, friendlyError } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { accountDeletionBlocker } from "@/lib/privacy";
import { sendEmail } from "@/lib/email";
import { deletionScheduledEmail } from "@/lib/emails";
import { formatDate } from "@/lib/format";

export async function requestBusinessDeletion(_prev, form) {
  const ctx = await requireBusiness();
  if (ctx.member.role !== "owner") return { error: "Only the owner can delete this business." };
  const { data: due, error } = await ctx.supabase.rpc("request_business_deletion", { target: ctx.business.id, confirm_name: String(form.get("confirm") || "") });
  if (error) return { error: friendlyError(error) };
  await sendEmail({ to: ctx.user.email, ...deletionScheduledEmail({ businessName: ctx.business.name, date: due }) }).catch(() => {});
  revalidatePath("/app", "layout");
  return { message: "Deletion scheduled." };
}

export async function cancelBusinessDeletion() {
  const ctx = await requireBusiness();
  const { error } = await ctx.supabase.rpc("cancel_business_deletion", { target: ctx.business.id });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { message: "Deletion cancelled. Your business is back to normal." };
}

export async function deleteMyAccount(_prev, form) {
  const ctx = await requireBusiness();
  if (String(form.get("confirm") || "").trim().toLowerCase() !== String(ctx.user.email).toLowerCase()) {
    return { error: "Type your email address exactly to confirm." };
  }
  const blocking = await accountDeletionBlocker(ctx);
  if (blocking) return { error: `You own ${blocking.join(", ")}. Delete or schedule the business for deletion first.` };
  const { error } = await createSupabaseService().auth.admin.deleteUser(ctx.user.id);
  if (error) return { error: "Could not delete your account. Contact support and we'll do it for you." };
  await ctx.supabase.auth.signOut().catch(() => {});
  redirect("/?account=deleted");
}
