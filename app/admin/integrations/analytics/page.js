import { requirePlatformAdmin } from "@/lib/context";
import { AnalyticsSettings } from "../../settings/forms";
import { IntegrationHeader, platformRow } from "../shared";

export const metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  await requirePlatformAdmin();
  return (
    <div className="flex flex-col gap-6">
      <IntegrationHeader title="Analytics" description="Visitor analytics for the live site. Read at page load, so changes don't need a redeploy." />
      <AnalyticsSettings saved={await platformRow()} />
    </div>
  );
}
