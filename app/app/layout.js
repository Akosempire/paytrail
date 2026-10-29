import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
import { UsageBeat } from "@/components/usage-beat";
import { reconcileSoon } from "@/lib/payments";
import { pushStockSoon } from "@/lib/pos";
import { requireBusiness } from "@/lib/context";
import { can, ROLES } from "@/lib/permissions";
import { logoUrl } from "@/lib/site";
import { isPaying } from "@/lib/plans";
import { OfflineAgent } from "@/components/offline-agent";

export default async function Layout({ children }) {
  const ctx = await requireBusiness();
  const { business, member } = ctx;
  // catch any customer payment whose webhook was missed, after the page is sent
  after(() => reconcileSoon(`b:${business.id}`, { businessId: business.id }));
  // and any TrackOja stock update that's due for a retry
  after(() => pushStockSoon(business.id));
  // replies from the team not read yet (0 until the Ideas & help SQL has run)
  const feedbackUnread = await ctx.supabase.from("feedback_threads").select("id", { count: "exact", head: true }).eq("user_id", ctx.user.id).eq("unread_user", true)
    .then((r) => r.count || 0, () => 0);
  return (
    <AppShell
      business={{ id: business.id, name: business.name, kind: business.kind, brand_color: business.brand_color, subscription_status: business.subscription_status, paying: isPaying(business) }}
      member={{ ...member, roleLabel: ROLES[member.role].label }}
      memberships={ctx.memberships.map((m) => ({ business_id: m.business_id, name: m.businesses?.name || "Business" }))}
      isPlatformAdmin={ctx.isPlatformAdmin}
      allowance={ctx.allowance}
      logo={logoUrl(business.logo_path)}
      tour={{ userId: ctx.user.id, done: Boolean(ctx.profile?.tour_done_at) }}
      perms={{
        canSettings: can(member, "settings.business"),
        canPayments: can(member, "settings.payments"),
        canTeam: can(member, "settings.team"),
        canBilling: can(member, "settings.billing"),
        canCosts: can(member, "costs.view"),
        canTax: can(member, "payments.record"),
        feedbackUnread,
      }}
    >
      {children}
      <OfflineAgent />
      {/* time in the app by area (Admin → Usage); the platform team's own use isn't counted */}
      {!ctx.isPlatformAdmin && <UsageBeat />}
    </AppShell>
  );
}
