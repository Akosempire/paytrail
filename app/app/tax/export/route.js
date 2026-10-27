import { requireBusiness } from "@/lib/context";
import { can } from "@/lib/permissions";
import { loadTaxMonth, taxCsv } from "@/lib/tax";
import { inNigeria } from "@/lib/einvoice";

// GET /app/tax/export?period=2026-10 (or 2026-Q4, 2026) → CSV for the accountant
export async function GET(request) {
  const ctx = await requireBusiness();
  if (!can(ctx.member, "payments.record")) return new Response("Not allowed", { status: 403 });
  const data = await loadTaxMonth(ctx, new URL(request.url).searchParams.get("period") || new URL(request.url).searchParams.get("month"));
  return new Response(taxCsv(data, { nigeria: inNigeria(ctx.business) }), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="usetally-tax-${data.month.key}.csv"`, "Cache-Control": "no-store" },
  });
}
