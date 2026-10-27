import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";

// Who is signed in. getClaims() checks the session token's signature locally
// (no network call when the project uses Supabase's JWT signing keys); the
// proxy has already refreshed the session on this request.
async function currentUser(supabase) {
  if (typeof supabase.auth.getClaims === "function") {
    const { data, error } = await supabase.auth.getClaims();
    const c = data?.claims;
    if (!error && c?.sub) return { id: c.sub, email: c.email, user_metadata: c.user_metadata || {}, app_metadata: c.app_metadata || {} };
    if (!error) return null;
  }
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
}

// app_context() (one database call) is used when the SQL for it has been run;
// until then the same data comes from the separate queries below.
let appContextMissing = false;

async function loadContext(supabase, user) {
  if (!appContextMissing) {
    const { data, error } = await supabase.rpc("app_context");
    if (!error && data) return { profile: data.profile, memberships: data.memberships || [], isAdmin: Boolean(data.is_admin), business: data.business, allowance: data.allowance };
    if (error && (error.code === "PGRST202" || /app_context/.test(error.message || ""))) appContextMissing = true;
  }
  const [{ data: profile }, { data: memberships }, { data: admin }] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    supabase.from("memberships").select("business_id, role, can_view_costs, full_name, email, businesses(id, name, kind, logo_path, brand_color)").eq("user_id", user.id),
    supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle(),
  ]);
  const list = memberships || [];
  const active = list.find((m) => m.business_id === profile?.active_business_id) || list[0] || null;
  let business = null, allowance = null;
  if (active) {
    const [{ data: b }, { data: a }] = await Promise.all([
      supabase.from("businesses").select("*, plans(id, name, document_limit, seat_limit, price_minor)").eq("id", active.business_id).single(),
      supabase.rpc("business_allowance", { target: active.business_id }),
    ]);
    business = b; allowance = a;
  }
  return { profile, memberships: list, isAdmin: Boolean(admin), business, allowance };
}

// Everything a signed-in page needs: who you are, which business you are
// working in, and your role there. Cached per request.
export const getContext = cache(async () => {
  const supabase = await createSupabaseServer();
  const user = await currentUser(supabase);
  if (!user) return { supabase, user: null };
  const { profile, memberships, isAdmin, business, allowance } = await loadContext(supabase, user);
  const active = business ? memberships.find((m) => m.business_id === business.id) : null;
  return {
    supabase,
    user,
    profile,
    isPlatformAdmin: isAdmin,
    memberships,
    member: active ? { role: active.role, can_view_costs: active.can_view_costs, full_name: active.full_name || profile?.full_name || "", email: user.email } : null,
    business,
    allowance,
  };
});

// for pages inside /app: signed in, and working in a business that finished onboarding
export async function requireBusiness() {
  const ctx = await getContext();
  if (!ctx.user) redirect("/login");
  if (!ctx.business) redirect("/onboarding");
  if (!ctx.business.onboarded_at) redirect("/onboarding");
  return ctx;
}

export async function requirePermission(action) {
  const ctx = await requireBusiness();
  if (!can(ctx.member, action)) redirect("/app?denied=1");
  return ctx;
}

export async function requirePlatformAdmin() {
  const ctx = await getContext();
  if (!ctx.user) redirect("/login?next=/admin");
  if (!ctx.isPlatformAdmin) redirect("/app");
  return ctx;
}

// turns database errors into one friendly sentence
export function friendlyError(error) {
  const message = String(error?.message || error || "Something went wrong.");
  const allowance = message.match(/ALLOWANCE:(\w+)/);
  if (allowance) {
    return {
      trial_used: "Your 14-day free trial has ended. Choose a plan in Settings → Plan & billing to keep sending.",
      free_limit: "You've sent this month's free documents. Choose a plan in Settings → Plan & billing to send more.",
      plan_limit: "You've reached this month's document limit on your plan. Upgrade in Settings → Billing.",
      subscription_required: "Your subscription has ended. Renew it in Settings → Billing to keep sending.",
      suspended: "This account is suspended. Contact Usetally support.",
      deletion_pending: "This business is scheduled for deletion. Cancel it in Settings → Privacy & data to send again.",
    }[allowance[1]] || "Your plan does not allow sending right now.";
  }
  if (/STEP_UP:/.test(message)) return "Confirm with the code we email you, then try again.";
  if (/duplicate key/.test(message)) return "That already exists.";
  if (/violates check constraint/.test(message)) return "Some details are not in the right format.";
  return message.replace(/^.*?ERROR:\s*/, "");
}
