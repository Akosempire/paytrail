"use server";
import { getContext } from "@/lib/context";

// remembers (per person, across devices) that the tour was finished or skipped;
// quietly does nothing until the profiles.tour_done_at column exists
export async function markTourDone() {
  const ctx = await getContext();
  if (!ctx.user) return { ok: false };
  await ctx.supabase.from("profiles").update({ tour_done_at: new Date().toISOString() }).eq("user_id", ctx.user.id).then(() => {}, () => {});
  return { ok: true };
}
