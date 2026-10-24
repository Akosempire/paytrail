import { createSupabaseService } from "@/lib/supabase/server";
import { receiptPdf } from "@/lib/pdf-response";

export async function GET(request, { params }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) return new Response("Not found", { status: 404 });
  const service = createSupabaseService();
  const { data: receipt } = await service.from("receipts").select("*").eq("access_token", token).maybeSingle();
  if (!receipt) return new Response("Not found", { status: 404 });
  return receiptPdf(service, receipt, request);
}
