"use server";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/context";
import { inviteMember } from "@/lib/team";

const done = () => revalidatePath("/app/settings/team");

export async function invite(form) {
  const ctx = await requirePermission("settings.team");
  if (ctx.business.kind !== "company") return { error: "Teams are for company accounts." };
  const seatLimit = ctx.business.subscription_status === "active" ? ctx.business.plans?.seat_limit : null;
  if (seatLimit) {
    const { count } = await ctx.supabase.from("memberships").select("user_id", { count: "exact", head: true }).eq("business_id", ctx.business.id);
    if (count >= seatLimit) return { error: `Your plan includes ${seatLimit} team members. Upgrade to add more.` };
  }
  const r = await inviteMember(ctx, { email: form.email, role: form.role, canViewCosts: form.canViewCosts });
  done();
  if (r.error) return r;
  return { ...r, message: r.emailed ? `Invitation emailed to ${r.email}.` : "Invitation created. Copy the link and send it to them." };
}

export async function updateMember(userId, { role, canViewCosts }) {
  const ctx = await requirePermission("settings.team");
  if (userId === ctx.user.id) return { error: "You can't change your own role." };
  if (!["manager", "finance", "junior_finance"].includes(role)) return { error: "Choose a role." };
  if (role === "manager" && ctx.member.role !== "owner") return { error: "Only the owner can make someone a manager." };
  const { data: target } = await ctx.supabase.from("memberships").select("role").eq("business_id", ctx.business.id).eq("user_id", userId).single();
  if (target?.role === "manager" && ctx.member.role !== "owner") return { error: "Only the owner can change a manager." };
  const { data, error } = await ctx.supabase.from("memberships").update({ role, can_view_costs: role === "manager" ? true : Boolean(canViewCosts) })
    .eq("business_id", ctx.business.id).eq("user_id", userId).select("user_id");
  if (error || !data?.length) return { error: "Could not update this person." };
  done();
  return { message: "Access updated." };
}

export async function removeMember(userId) {
  const ctx = await requirePermission("settings.team");
  if (userId === ctx.user.id) return { error: "You can't remove yourself." };
  const { data, error } = await ctx.supabase.from("memberships").delete().eq("business_id", ctx.business.id).eq("user_id", userId).select("user_id");
  if (error || !data?.length) return { error: "Could not remove this person." };
  done();
  return { message: "Removed from the team." };
}

export async function revokeInvite(id) {
  const ctx = await requirePermission("settings.team");
  await ctx.supabase.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("business_id", ctx.business.id);
  done();
  return { message: "Invitation cancelled." };
}
