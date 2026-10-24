import { createSupabaseService } from "@/lib/supabase/server";
import { documentPdf } from "@/lib/pdf-response";

export async function GET(_req, { params }) {
  const { token } = await params;
  if (!/^[a-f0-9]{48}$/.test(token)) return new Response("Not found", { status: 404 });
  const service = createSupabaseService();
  const { data: doc } = await service.from("documents").select("*").eq("access_token", token).maybeSingle();
  if (!doc || ["draft", "pending_approval"].includes(doc.status)) return new Response("Not found", { status: 404 });
  return documentPdf(service, doc);
}
