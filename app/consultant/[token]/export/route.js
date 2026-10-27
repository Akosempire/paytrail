import { createSupabaseService } from "@/lib/supabase/server";
import { returnCsv } from "@/lib/vat-export";
import { consultantFor } from "../lookup";

export async function GET(request, { params }) {
  const { token } = await params;
  const c = await consultantFor(token);
  if (!c) return new Response("Not found", { status: 404 });
  const { data: ret } = await createSupabaseService().from("vat_returns").select("*").eq("id", new URL(request.url).searchParams.get("return")).eq("consultant_id", c.id).maybeSingle();
  return (ret && (await returnCsv(ret))) || new Response("Not found", { status: 404 });
}
