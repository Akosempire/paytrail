"use server";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { sha256 } from "@/lib/crypto";
import { featuresOf, hasFeature, upgradeMessage } from "@/lib/entitlements";
import { LINK_MINUTES, makeCode, normPhone, waShareLink } from "@/lib/whatsapp/core";
import { whatsappConfig } from "@/lib/whatsapp/config";

// A one-time code (10 minutes) the person sends to the bot from the WhatsApp
// number they want to link. Only its hash is stored.
export async function createWhatsappLinkCode() {
  const ctx = await requireBusiness();
  if (!hasFeature(await featuresOf(ctx.supabase, ctx.business.id), "whatsapp")) return { error: upgradeMessage("whatsapp") };
  const cfg = await whatsappConfig();
  if (!cfg.ready) return { error: "WhatsApp isn't switched on for Usetally yet. Try again soon." };
  const service = createSupabaseService();
  const { count } = await service.from("whatsapp_link_codes").select("code_hash", { count: "exact", head: true }).eq("user_id", ctx.user.id).gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
  if ((count || 0) >= 5) return { error: "That's a lot of codes. Wait a few minutes, then try again." };
  const code = makeCode(randomInt);
  const expires = new Date(Date.now() + LINK_MINUTES * 60_000).toISOString();
  const { error } = await service.from("whatsapp_link_codes").insert({ code_hash: sha256(`wa:${code}`), user_id: ctx.user.id, business_id: ctx.business.id, expires_at: expires });
  if (error) return { error: /whatsapp_link_codes/.test(error.message) ? "WhatsApp needs a database update. Ask your Usetally admin to run RUN_NEW_2026-11-14a.sql." : "Couldn't make a code. Try again." };
  return { code, expiresAt: expires, open: waShareLink(normPhone(cfg.from), `LINK ${code}`) };
}

export async function removeWhatsappLink(id) {
  const ctx = await requireBusiness();
  const { data, error } = await ctx.supabase.from("whatsapp_links").delete().eq("id", id).eq("user_id", ctx.user.id).select("phone");
  if (error || !data?.length) return { error: "Couldn't remove it. Reload and try again." };
  await createSupabaseService().from("whatsapp_sessions").delete().eq("phone", data[0].phone);
  revalidatePath("/app/settings/whatsapp");
  return { message: "Removed. That number can't use Usetally on WhatsApp any more." };
}
