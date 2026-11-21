"use server";
import { randomBytes } from "node:crypto";
import { createSupabaseService } from "@/lib/supabase/server";
import { clientIp, limits } from "@/lib/guard";
import { checkSignup } from "@/lib/community";
import { communitySettings, sendCommunityEmail } from "@/lib/community-run";

// The public community form: save the sign-up and email the group link.
// Signing up again with the same email updates the details and resends it.
export async function joinCommunity(input) {
  const service = createSupabaseService();
  const cfg = await communitySettings(service);
  if (!cfg.ready) return { error: "Sign-ups are closed right now. Please check back soon." };
  const { data, error, field } = checkSignup(input, cfg.batches);
  if (error) return { error, field };
  const gate = await limits([
    ["community-ip", await clientIp(), 3600, 15, "Too many sign-ups from here. Try again in an hour."],
    ["community-email", data.email, 3600, 3, "We've already sent the link to this email. Check your inbox and spam folder."],
  ]);
  if (!gate.ok) return { error: gate.error };

  const now = new Date().toISOString();
  const { data: existing } = await service.from("community_signups").select("id, token, clicked_at").ilike("email", data.email).maybeSingle();
  let row;
  if (existing) {
    const { data: r, error: e } = await service.from("community_signups").update({ ...data, stopped_at: null, updated_at: now }).eq("id", existing.id).select("id, name, email, token").single();
    if (e) return { error: "Couldn't save that. Please try again." };
    row = r;
  } else {
    const { data: r, error: e } = await service.from("community_signups").insert({ ...data, token: randomBytes(24).toString("base64url") }).select("id, name, email, token").single();
    if (e) {
      console.error("community.signup_failed", { message: e.message });
      return { error: /community_signups|schema cache/.test(e.message) ? "Sign-ups aren't ready yet. Please check back soon." : "Couldn't save that. Please try again." };
    }
    row = r;
  }
  const sent = await sendCommunityEmail(service, row, { rules: cfg.rules });
  if (!sent.sent) console.error("community.email_failed", { error: sent.error });
  return { ok: true, email: data.email, emailed: sent.sent };
}
