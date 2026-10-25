import { requirePlatformAdmin } from "@/lib/context";
import { r2Check, storageSaved } from "@/lib/storage";
import { createSupabaseService } from "@/lib/supabase/server";
import { StorageStatus } from "../../settings/storage-status";
import { IntegrationHeader } from "../shared";

export const metadata = { title: "File storage" };

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

export default async function StoragePage() {
  await requirePlatformAdmin();
  const [status, saved, waiting] = await Promise.all([r2Check(), storageSaved(), imagesWaiting()]);
  return (
    <div className="flex flex-col gap-6">
      <IntegrationHeader title="File storage" description="Cloudflare R2 holds logos, signatures and attached files. Details are checked with a test upload before they're saved." />
      <StorageStatus status={status} saved={saved} waiting={waiting} />
    </div>
  );
}
