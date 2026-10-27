import { after } from "next/server";
import { AppShell } from "@/components/app-shell";
import { reconcileSoon } from "@/lib/payments";
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
      }}
    >
      {children}
      <OfflineAgent />
    </AppShell>
  );
}
