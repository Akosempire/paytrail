import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { loadTaxMonth, taxCsv } from "@/lib/tax";

// the business's tax CSV for one month, for the platform admin or the consultant on the job
export async function returnCsv(ret) {
  const service = createSupabaseService();
  const { data: business } = await service.from("businesses").select("*").eq("id", ret.business_id).maybeSingle();
  if (!business) return null;
  const data = await loadTaxMonth({ supabase: service, business }, ret.period);
  const name = `${business.name.replace(/[^\w]+/g, "-").slice(0, 40)}-vat-${ret.period}.csv`;
  return new Response(taxCsv(data), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
