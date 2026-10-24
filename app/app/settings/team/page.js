import { redirect } from "next/navigation";
import { requireBusiness } from "@/lib/context";
import { can, ROLES } from "@/lib/permissions";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { TeamManager } from "./team-manager";

export const metadata = { title: "Team" };

export default async function Team() {
  const ctx = await requireBusiness();
  if (ctx.business.kind !== "company") redirect("/app");
  const manage = can(ctx.member, "settings.team");
  const [{ data: members }, { data: invites }] = await Promise.all([
    ctx.supabase.from("memberships").select("user_id, role, can_view_costs, full_name, email, created_at").eq("business_id", ctx.business.id).order("created_at"),
    manage ? ctx.supabase.from("invitations").select("id, email, role, can_view_costs, expires_at, created_at").eq("business_id", ctx.business.id).is("accepted_at", null).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const seatLimit = ctx.business.subscription_status === "active" ? ctx.business.plans?.seat_limit : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Team & roles" description={seatLimit ? `${members.length} of ${seatLimit} seats used on your plan.` : "Everyone who works on your quotes and invoices."} />
      <TeamManager members={members || []} invites={invites || []} me={ctx.user.id} myRole={ctx.member.role} manage={manage} />
      <Card>
        <CardHeader title="What each role can do" />
        <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(ROLES).map(([k, r]) => (
            <div key={k} className="bg-surface p-5"><p className="text-sm font-semibold text-ink">{r.label}</p><p className="mt-1 text-[13px] text-ink-2">{r.summary}</p></div>
          ))}
        </div>
      </Card>
    </div>
  );
}
