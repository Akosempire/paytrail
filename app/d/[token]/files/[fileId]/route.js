import { createSupabaseService } from "@/lib/supabase/server";
import { fileResponse } from "@/lib/file-response";

// a customer opening a file the business shared on their link
export async function GET(request, { params }) {
  const { token, fileId } = await params;
  if (!/^[a-f0-9]{48}$/.test(token) || !/^[0-9a-f-]{36}$/.test(fileId)) return new Response("Not found", { status: 404 });
  const service = createSupabaseService();
  const { data: doc } = await service.from("documents").select("id, status, converted_invoice_id").eq("access_token", token).maybeSingle();
  if (!doc || ["draft", "pending_approval"].includes(doc.status)) return new Response("Not found", { status: 404 });
  const { data: file } = await service.from("document_files").select("name, content_type, storage_key")
    .eq("id", fileId).eq("shared", true).in("document_id", [doc.id, doc.converted_invoice_id].filter(Boolean)).maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });
  return fileResponse(file, { download: new URL(request.url).searchParams.has("download") });
}
