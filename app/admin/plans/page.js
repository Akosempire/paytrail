import { requirePlatformAdmin } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { PlanEditor } from "./plan-editor";

export const metadata = { title: "Plans & pricing" };

export default async function Plans() {
  const ctx = await requirePlatformAdmin();
  const [{ data: plans }, { data: subs }] = await Promise.all([
    ctx.supabase.from("plans").select("*").order("sort_order").order("price_minor"),
    ctx.supabase.from("businesses").select("plan_id").eq("subscription_status", "active"),
  ]);
  const counts = {};
  for (const s of subs || []) if (s.plan_id) counts[s.plan_id] = (counts[s.plan_id] || 0) + 1;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plans & pricing" description="Set what Usetally costs. Changes show on every business's billing page straight away. Nothing is hardcoded." />
      <PlanEditor plans={plans || []} counts={counts} />
    </div>
  );
}
