import { requireBusiness } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { exportBusinessData, exportMyData, exportResponse } from "@/lib/privacy";

// GET ?scope=business (owner only) or ?scope=me (anyone): a complete JSON copy
export async function GET(request) {
  const ctx = await requireBusiness();
  const scope = new URL(request.url).searchParams.get("scope");
  if (scope === "business") {
    if (ctx.member.role !== "owner") return new Response("Only the owner can download the business's data.", { status: 403 });
    const data = await exportBusinessData(ctx);
    await createSupabaseService().from("activity").insert({ business_id: ctx.business.id, actor_id: ctx.user.id, actor_label: ctx.member.full_name || ctx.user.email, action: "data.exported", detail: { scope: "business" } }).then(() => {}, () => {});
    return exportResponse(data, ctx.business.name);
  }
  return exportResponse(await exportMyData(ctx), ctx.member.full_name || "my-data");
}
