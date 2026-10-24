import "server-only";
import { randomToken, sha256 } from "@/lib/crypto";
import { brandedEmail, sendEmail } from "@/lib/email";
import { siteUrl, logoUrl } from "@/lib/site";
import { createSupabaseService } from "@/lib/supabase/server";
import { ROLES } from "@/lib/permissions";

// creates an invitation and emails it when email is set up. Returns the link
// either way so it can also be shared on WhatsApp.
export async function inviteMember(ctx, { email, role, canViewCosts }) {
  const address = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(address)) return { error: `"${email}" is not a valid email.` };
  if (!["manager", "finance", "junior_finance"].includes(role)) return { error: "Choose a role." };
  if (role === "manager" && ctx.member.role !== "owner") return { error: "Only the owner can invite managers." };
  const token = randomToken(24);
  const { error } = await ctx.supabase.from("invitations").insert({
    business_id: ctx.business.id, email: address, role,
    can_view_costs: role === "finance" ? canViewCosts !== false : Boolean(canViewCosts),
    token_hash: sha256(token), invited_by: ctx.user.id,
  });
  if (error) return { error: error.message };
  const link = `${siteUrl()}/invite/${token}`;
  const mail = await sendEmail({
    to: address,
    subject: `Join ${ctx.business.name} on PayTrail`,
    fromName: ctx.business.name,
    html: brandedEmail({
      brandName: ctx.business.name, brandColor: ctx.business.brand_color, logo: logoUrl(ctx.business.logo_path),
      heading: `You're invited to ${ctx.business.name}`,
      lines: [`${ctx.member.full_name || "A teammate"} added you as ${ROLES[role].label} on PayTrail, where ${ctx.business.name} prepares quotes and invoices.`, "The link works for 7 days."],
      buttonText: "Accept invitation", buttonUrl: link,
    }),
  });
  await createSupabaseService().from("activity").insert({ business_id: ctx.business.id, actor_id: ctx.user.id, actor_label: ctx.member.full_name || ctx.user.email, action: "team.invited", detail: { email: address, role } }).then(() => {}, () => {});
  return { link, emailed: mail.sent, email: address };
}
