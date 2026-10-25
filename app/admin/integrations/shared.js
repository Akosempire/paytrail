import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui";
import { createSupabaseService } from "@/lib/supabase/server";

// heading with a way back to the Integrations list
export function IntegrationHeader({ title, description }) {
  return (
    <div className="flex flex-col gap-3">
      <Link href="/admin/integrations" className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-ink-2 hover:text-ink"><ArrowLeft className="size-4" />Integrations</Link>
      <PageHeader title={title} description={description} />
    </div>
  );
}

// the platform settings row, read with the service key (admins only reach this)
export async function platformRow() {
  const { data } = await createSupabaseService().from("platform_settings").select("*").eq("id", true).maybeSingle();
  return data || {};
}
