import { requirePlatformAdmin } from "@/lib/context";
import { PageHeader } from "@/components/ui";
import { TrialSettings } from "./platform-settings";
import { AlertSettings, CompanyLegalSettings, PublicStatsSettings } from "./forms";
import { createSupabaseService } from "@/lib/supabase/server";
import { platformRow } from "../integrations/shared";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePlatformAdmin();
  const s = await platformRow();
  // the same totals the website shows (computed even while hidden, for a preview)
  const service = createSupabaseService();
  const stats = await Promise.all([
    service.from("payments").select("amount_minor, currency").in("currency", ["NGN", "USD"]).limit(100000),
    service.rpc("public_stats"),
  ]).then(([p, r]) => r.data ? { users: Number(r.data.users), ngnMinor: Number(r.data.ngn_minor), usdMinor: Number(r.data.usd_minor) } : {
    users: null,
    ngnMinor: (p.data || []).filter((x) => x.currency === "NGN").reduce((n, x) => n + Number(x.amount_minor), 0),
    usdMinor: (p.data || []).filter((x) => x.currency === "USD").reduce((n, x) => n + Number(x.amount_minor), 0),
  }).catch(() => null);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="The free trial, who runs Usetally, and who gets alerts. Service keys live under Integrations." />
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <TrialSettings settings={s} />
        <AlertSettings saved={s} />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <PublicStatsSettings on={s.public_stats !== false} stats={stats} />
      </div>
      <CompanyLegalSettings saved={s} />
    </div>
  );
}
