import { requireAdminSection } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { PlanEditor } from "./plan-editor";
import { loadPlans } from "./load";

export const metadata = { title: "Plans & pricing" };

export default async function Plans() {
  const ctx = await requireAdminSection("plans");
  const { plans, counts, usage } = await loadPlans(ctx);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plans & pricing" description="Set what Usetally costs. Changes show on every business's billing page straight away. Nothing is hardcoded." />
      <PlanEditor plans={plans} counts={counts} usage={usage} />
    </div>
  );
}
