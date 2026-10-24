import { AppShell } from "@/components/app-shell";
import { requireBusiness } from "@/lib/context";
import { can, ROLES } from "@/lib/permissions";
import { logoUrl } from "@/lib/site";

export default async function Layout({ children }) {
  const ctx = await requireBusiness();
  const { business, member } = ctx;
  return (
    <AppShell
      business={{ id: business.id, name: business.name, kind: business.kind, brand_color: business.brand_color, subscription_status: business.subscription_status }}
      member={{ ...member, roleLabel: ROLES[member.role].label }}
      memberships={ctx.memberships.map((m) => ({ business_id: m.business_id, name: m.businesses?.name || "Business" }))}
      isPlatformAdmin={ctx.isPlatformAdmin}
      allowance={ctx.allowance}
      logo={logoUrl(business.logo_path)}
      perms={{
        canSettings: can(member, "settings.business"),
        canPayments: can(member, "settings.payments"),
        canTeam: can(member, "settings.team"),
        canBilling: can(member, "settings.billing"),
        canCosts: can(member, "costs.view"),
      }}
    >
      {children}
    </AppShell>
  );
}
