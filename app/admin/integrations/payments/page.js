import { requirePlatformAdmin } from "@/lib/context";
import { siteUrl } from "@/lib/site";
import { credentialsFor } from "@/lib/payments";
import { createSupabaseService } from "@/lib/supabase/server";
import { BillingSettings } from "../../settings/platform-settings";
import { IntegrationHeader, platformRow } from "../shared";

export const metadata = { title: "Subscription payments" };

export default async function PaymentsPage() {
  await requirePlatformAdmin();
  const [s, billing] = await Promise.all([platformRow(), credentialsFor(createSupabaseService(), null).catch(() => null)]);
  return (
    <div className="flex flex-col gap-6">
      <IntegrationHeader title="Subscription payments" description="Usetally's own payment account for plan subscriptions. Separate from the accounts businesses connect for their customers." />
      <BillingSettings settings={{ billing_provider: s.billing_provider || "manual", billing_key_hint: s.billing_key_hint }} billingMode={billing?.mode || null}
        webhooks={Object.fromEntries(["stripe", "paystack", "flutterwave", "bachs"].map((p) => [p, `${siteUrl()}/api/webhooks/${p}/platform`]))} />
    </div>
  );
}
