import { requirePermission } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { Presets } from "./presets";

export const metadata = { title: "Cost presets" };

export default async function Page() {
  const ctx = await requirePermission("costs.view");
  const { data } = await ctx.supabase.from("cost_presets").select("*").eq("business_id", ctx.business.id).order("label");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Cost presets" description="Costs you add to most jobs, like monthly data, fuel or software. Add them to any quote in one click. Customers never see them." />
      <Presets presets={data || []} currency={ctx.business.currency} />
    </div>
  );
}
