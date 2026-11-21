"use server";
import { revalidatePath } from "next/cache";
import { requireAdminSection } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { parseBatches } from "@/lib/community";
import { communitySettings, sendCommunityEmail } from "@/lib/community-run";

export async function saveCommunitySettings(form) {
  await requireAdminSection("marketing");
  const link = String(form.link || "").trim();
  if (link && !/^https:\/\/(chat\.whatsapp\.com|wa\.me|whatsapp\.com)\//i.test(link)) return { error: "Paste the WhatsApp group invite link. It starts with https://chat.whatsapp.com/" };
  if (form.enabled && !link) return { error: "Add the group link before opening sign-ups." };
  const { error } = await createSupabaseService().from("platform_settings").update({
    community_enabled: Boolean(form.enabled), community_link: link, community_batches: parseBatches(form.batches),
    community_rules: String(form.rules || "").trim().slice(0, 1000), updated_at: new Date().toISOString(),
  }).eq("id", true);
  if (error) return { error: /community|column|schema cache/i.test(error.message) ? "Run supabase/RUN_NEW_2026-11-21a.sql in Supabase first." : "Couldn't save. Try again." };
  revalidatePath("/admin/community"); revalidatePath("/community");
  return { message: form.enabled ? "Saved. Sign-ups are open at /community." : "Saved. Sign-ups are closed." };
}

export async function resendCommunityLink(id) {
  await requireAdminSection("marketing");
  const service = createSupabaseService();
  const { data: row } = await service.from("community_signups").select("id, name, email, token").eq("id", id).maybeSingle();
  if (!row) return { error: "Not found." };
  const cfg = await communitySettings(service);
  const r = await sendCommunityEmail(service, row, { rules: cfg.rules });
  revalidatePath("/admin/community");
  return r.sent ? { message: `Link sent again to ${row.email}.` } : { error: r.error };
}
