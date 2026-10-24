import { requirePermission } from "@/lib/context";
import { logoUrl } from "@/lib/site";
import { PageHeader } from "@/components/ui";
import { BusinessForm } from "./business-form";

export const metadata = { title: "Business & branding" };

export default async function Page() {
  const ctx = await requirePermission("settings.business");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Business & branding" description="What your customers see on every quote, invoice, receipt and email." />
      <BusinessForm business={ctx.business} logo={logoUrl(ctx.business.logo_path)} />
    </div>
  );
}
