"use server";
import { revalidatePath } from "next/cache";
import { friendlyError, requirePermission } from "@/lib/context";

// Settings → TrackOja POS → Disconnect. TrackOja's next call gets a 401 and it
// stops syncing (contract §2).
export async function disconnectPos(connectionId) {
  const ctx = await requirePermission("settings.payments");
  const { data: conn } = await ctx.supabase.from("pos_connections").select("id").eq("id", String(connectionId || "")).eq("business_id", ctx.business.id).is("revoked_at", null).maybeSingle();
  if (!conn) return { error: "TrackOja is already disconnected." };
  const { error } = await ctx.supabase.rpc("pos_revoke", { conn_id: conn.id });
  revalidatePath("/app/settings/pos");
  revalidatePath("/app", "layout");
  return error ? { error: friendlyError(error) } : { message: "TrackOja disconnected. New sales won't be recorded here." };
}
