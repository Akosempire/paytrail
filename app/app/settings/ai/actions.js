"use server";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { can } from "@/lib/permissions";
import { createSupabaseService } from "@/lib/supabase/server";

// Settings → AI assistants → Disconnect. The assistant's next request gets a
// 401 and it stops working until someone connects it again. People disconnect
// their own; owners and managers can disconnect anyone's in the business.
export async function disconnectAssistant(id) {
  const ctx = await requireBusiness();
  const service = createSupabaseService();
  const { data: c } = await service.from("ai_connections").select("id, user_id, app_name").eq("id", String(id || "")).eq("business_id", ctx.business.id).is("revoked_at", null).maybeSingle();
  if (!c) return { error: "That assistant is already disconnected." };
  if (c.user_id !== ctx.user.id && !can(ctx.member, "settings.team")) return { error: "Only the person who connected it, or an owner or manager, can disconnect it." };
  const { error } = await service.from("ai_connections").update({ revoked_at: new Date().toISOString() }).eq("id", c.id);
  if (error) return { error: "Couldn't disconnect it. Try again." };
  await service.from("oauth_tokens").delete().eq("connection_id", c.id);
  revalidatePath("/app/settings/ai");
  return { message: `${c.app_name || "The assistant"} is disconnected.` };
}
