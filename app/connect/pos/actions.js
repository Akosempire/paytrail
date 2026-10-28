"use server";
import { redirect } from "next/navigation";
import { friendlyError, getContext } from "@/lib/context";
import { underLimit } from "@/lib/guard";
import { checkReturnTo, cleanState, cleanText, hashSecret, newLinkCode, returnOrigins, returnUrl } from "@/lib/pos-core";

// Approve → a one-time code (only its SHA-256 is stored, 10 minutes, single
// use) and back to TrackOja with ?code=…&state=…. Deny → ?error=access_denied.
export async function decidePosLink(_prev, form) {
  const ctx = await getContext();
  if (!ctx.user) redirect("/login");
  const returnTo = checkReturnTo(form.get("return_to"), returnOrigins(process.env.POS_RETURN_ORIGINS));
  const state = cleanState(form.get("state"));
  if (!returnTo || !state) return { error: "This link from TrackOja isn't valid. Start again from TrackOja." };
  if (form.get("decision") !== "approve") redirect(returnUrl(returnTo, { error: "access_denied", state }));

  const businessId = String(form.get("business_id") || "");
  const member = ctx.memberships.find((m) => m.business_id === businessId);
  if (!member || !["owner", "manager"].includes(member.role)) return { error: "Only an owner or manager of the business can connect TrackOja." };
  if (!(await underLimit("poscode", ctx.user.id, 600, 20))) return { error: "Too many tries. Wait a few minutes, then start again from TrackOja." };
  const code = newLinkCode();
  const { error } = await ctx.supabase.rpc("pos_create_link_code", { target: businessId, hashed_code: hashSecret(code), store: cleanText(form.get("store"), 120) });
  if (error) {
    if (/pos_create_link_code/.test(error.message || "")) return { error: "Connecting TrackOja needs a database update. Run RUN_NEW_2026-10-29a.sql in Supabase, then try again." };
    return { error: friendlyError(error) };
  }
  redirect(returnUrl(returnTo, { code, state }));
}
