import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { fileResponse } from "@/lib/file-response";

export async function GET(_request, { params }) {
  const { fileId } = await params;
  await requirePlatformAdmin();
  const { data: file } = await createSupabaseService().from("vat_return_files").select("name, content_type, storage_key").eq("id", fileId).maybeSingle();
  return file ? fileResponse(file) : new Response("Not found", { status: 404 });
}
