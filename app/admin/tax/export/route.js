import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { returnCsv } from "@/lib/vat-export";

export async function GET(request) {
  await requirePlatformAdmin();
  const id = new URL(request.url).searchParams.get("return");
  const { data: ret } = await createSupabaseService().from("vat_returns").select("*").eq("id", id).maybeSingle();
  return (ret && (await returnCsv(ret))) || new Response("Not found", { status: 404 });
}
