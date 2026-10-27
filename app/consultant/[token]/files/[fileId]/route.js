import { createSupabaseService } from "@/lib/supabase/server";
import { fileResponse } from "@/lib/file-response";
import { consultantFor } from "../../lookup";

export async function GET(_request, { params }) {
  const { token, fileId } = await params;
  const c = await consultantFor(token);
  if (!c) return new Response("Not found", { status: 404 });
  const service = createSupabaseService();
  const { data: file } = await service.from("vat_return_files").select("name, content_type, storage_key, return_id").eq("id", fileId).maybeSingle();
  if (!file) return new Response("Not found", { status: 404 });
  const { data: ret } = await service.from("vat_returns").select("id").eq("id", file.return_id).eq("consultant_id", c.id).maybeSingle();
  return ret ? fileResponse(file) : new Response("Not found", { status: 404 });
}
