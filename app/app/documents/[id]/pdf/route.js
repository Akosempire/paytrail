import { requireBusiness } from "@/lib/context";
import { documentPdf } from "@/lib/pdf-response";

export async function GET(request, { params }) {
  const { id } = await params;
  const ctx = await requireBusiness();
  const { data: doc } = await ctx.supabase.from("documents").select("*").eq("id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!doc) return new Response("Not found", { status: 404 });
  return documentPdf(ctx.supabase, doc, request);
}
