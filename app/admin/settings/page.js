import { requirePlatformAdmin } from "@/lib/context";
import { siteUrl } from "@/lib/site";
import { PageHeader } from "@/components/ui";
import { PlatformSettings } from "./platform-settings";

export const metadata = { title: "Trial & billing" };

export default async function Page() {
  const ctx = await requirePlatformAdmin();
  const { data: s } = await ctx.supabase.from("platform_settings").select("trial_mode, trial_documents, trial_days, billing_provider, billing_key_hint, support_email").eq("id", true).single();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Trial & billing" description="How new businesses try PayTrail, and how PayTrail collects subscription payments." />
      <PlatformSettings settings={s} webhooks={Object.fromEntries(["stripe", "paystack", "flutterwave", "bachs"].map((p) => [p, `${siteUrl()}/api/webhooks/${p}/platform`]))} />
    </div>
  );
}
