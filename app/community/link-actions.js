"use server";
import { createSupabaseService } from "@/lib/supabase/server";

// Called by the browser (not by email scanners, which don't run scripts), so a
// link checked by a mail filter doesn't count as the person joining.
export async function markJoined(token) {
  if (!/^[\w-]{20,64}$/.test(String(token || ""))) return { ok: false };
  const now = new Date().toISOString();
  await createSupabaseService().from("community_signups").update({ clicked_at: now, updated_at: now }).eq("token", token).is("clicked_at", null);
  return { ok: true };
}

export async function stopReminders(token) {
  if (!/^[\w-]{20,64}$/.test(String(token || ""))) return { ok: false };
  const now = new Date().toISOString();
  const { data } = await createSupabaseService().from("community_signups").update({ stopped_at: now, updated_at: now }).eq("token", token).select("id");
  return { ok: Boolean(data?.length) };
}
