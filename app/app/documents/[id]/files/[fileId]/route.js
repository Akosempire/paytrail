import { requireBusiness } from "@/lib/context";
import { fileResponse } from "@/lib/file-response";

// a team member opening an attached file
export async function GET(request, { params }) {
  const { id, fileId } = await params;
  const ctx = await requireBusiness();
  const { data: file } = await ctx.supabase.from("document_files").select("name, content_type, storage_key")
    .eq("id", fileId).eq("document_id", id).eq("business_id", ctx.business.id).maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });
  return fileResponse(file, { download: new URL(request.url).searchParams.has("download") });
}
