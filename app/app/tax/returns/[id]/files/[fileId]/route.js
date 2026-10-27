import { requireBusiness } from "@/lib/context";
import { fileResponse } from "@/lib/file-response";

// a team member opening a VAT return's acknowledgement or payment receipt
export async function GET(request, { params }) {
  const { id, fileId } = await params;
  const ctx = await requireBusiness();
  const { data: file } = await ctx.supabase.from("vat_return_files").select("name, content_type, storage_key")
    .eq("id", fileId).eq("return_id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });
  return fileResponse(file, { download: new URL(request.url).searchParams.has("download") });
}
