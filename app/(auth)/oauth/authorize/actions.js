"use server";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { checkAuthorizeRequest, redirectWith } from "@/lib/ai/oauth-core";
import { createCode, getClient } from "@/lib/ai/oauth";
import { aiSite } from "@/lib/ai/http";
import { featuresOf, hasFeature } from "@/lib/entitlements";

// The consent screen's two buttons. Every field is checked again here: the
// form's hidden fields are only a convenience, never trusted.
const PARAMS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"];
const read = (form) => Object.fromEntries(PARAMS.map((k) => [k, String(form.get(k) ?? "")]));

async function recheck(form) {
  const params = read(form);
  const service = createSupabaseService();
  const client = await getClient(service, params.client_id);
  return { params, service, client, req: checkAuthorizeRequest(params, client, aiSite()) };
}

export async function allowAccess(form) {
  const ctx = await getContext();
  if (!ctx.user) redirect("/login");
  const { service, client, req } = await recheck(form);
  if (req.fatal) return { error: req.fatal };
  if (req.error) redirect(redirectWith(req.redirect, { error: req.error, error_description: req.description, state: req.state, iss: aiSite() }));
  const businessId = String(form.get("business") || "");
  if (!ctx.memberships.some((m) => m.business_id === businessId)) return { error: "Pick one of your businesses." };
  // view only can't be widened to full access by editing the form
  const wanted = form.get("access") === "read" ? "read" : "read write";
  // full access is a paid feature: on Free the app can only look
  const full = hasFeature(await featuresOf(ctx.supabase, businessId), "ai_full");
  const scope = req.scope === "read" || !full ? "read" : wanted;
  const r = await createCode(service, { client, userId: ctx.user.id, businessId, scope, redirect: req.redirect, challenge: req.challenge, resource: req.resource });
  if (r.error) return { error: r.error };
  redirect(redirectWith(req.redirect, { code: r.code, state: req.state, iss: aiSite() }));
}

export async function denyAccess(form) {
  const { req } = await recheck(form);
  if (req.fatal) redirect("/app");
  redirect(redirectWith(req.redirect, { error: "access_denied", state: req.state, iss: aiSite() }));
}
