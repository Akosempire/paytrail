import { requirePlatformAdmin } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { TrialSettings } from "./platform-settings";
import { AlertSettings, CompanyLegalSettings } from "./forms";
import { platformRow } from "../integrations/shared";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePlatformAdmin();
  const s = await platformRow();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="The free trial, who runs Usetally, and who gets alerts. Service keys live under Integrations." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <TrialSettings settings={s} />
        <AlertSettings saved={s} />
      </div>
      <CompanyLegalSettings saved={s} />
    </div>
  );
}
