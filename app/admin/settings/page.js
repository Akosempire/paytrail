import { requirePlatformAdmin } from "@/lib/context";
import { siteUrl } from "@/lib/site";
import { PageHeader } from "@/components/ui";
import { PlatformSettings } from "./platform-settings";
import { EmailStatus } from "./email-status";
import { emailStatus } from "@/lib/email";
import { StorageStatus } from "./storage-status";
import { r2Check, storageSaved } from "@/lib/storage";
import { createSupabaseService } from "@/lib/supabase/server";
import { credentialsFor } from "@/lib/payments";

// images not yet on R2 (older uploads in Supabase Storage); null if unknown
async function imagesWaiting() {
  try {
    const service = createSupabaseService();
    let { data, error } = await service.from("businesses").select("logo_path, signature_path").or("logo_path.not.is.null,signature_path.not.is.null").limit(5000);
    if (error) ({ data, error } = await service.from("businesses").select("logo_path").not("logo_path", "is", null).limit(5000)); // before the signature update
    if (error) return null;
    return data.reduce((n, b) => n + [b.logo_path, b.signature_path].filter((p) => p && !p.startsWith("r2:") && !p.startsWith("http")).length, 0);
  } catch { return null; }
}

export const metadata = { title: "Trial & billing" };

export default async function Page() {
  const ctx = await requirePlatformAdmin();
  const { data: s } = await ctx.supabase.from("platform_settings").select("trial_mode, trial_documents, trial_days, billing_provider, billing_key_hint, support_email").eq("id", true).single();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Trial & billing" description="How new businesses try Usetally, and how Usetally collects subscription payments." />
      <EmailStatus status={await emailStatus()} />
      <StorageStatus status={await r2Check()} saved={await storageSaved()} waiting={await imagesWaiting()} />
      <PlatformSettings settings={s} billingMode={await credentialsFor(createSupabaseService(), null).then((c) => c?.mode || null).catch(() => null)} webhooks={Object.fromEntries(["stripe", "paystack", "flutterwave", "bachs"].map((p) => [p, `${siteUrl()}/api/webhooks/${p}/platform`]))} />
    </div>
  );
}
