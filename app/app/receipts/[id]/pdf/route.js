import { requireBusiness } from "@/lib/context";
import { receiptPdf } from "@/lib/pdf-response";

export async function GET(request, { params }) {
  const { id } = await params;
  const ctx = await requireBusiness();
  const { data: receipt } = await ctx.supabase.from("receipts").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!receipt) return new Response("Not found", { status: 404 });
  return receiptPdf(ctx.supabase, receipt, request);
}
