import { requirePlanManager } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { PlanEditor } from "@/app/admin/plans/plan-editor";
import { loadPlans } from "@/app/admin/plans/load";

export const metadata = { title: "Plans & prices" };
export const dynamic = "force-dynamic";

// The same plan editor as Admin → Plans, for co-founders who manage plans.
export default async function FounderPlans() {
  const ctx = await requirePlanManager();
  const { plans, counts, usage } = await loadPlans(ctx);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plans & prices" description="What Usetally costs. Changes show on every business's billing page and the website straight away." />
      <PlanEditor plans={plans} counts={counts} usage={usage} />
    </div>
  );
}
