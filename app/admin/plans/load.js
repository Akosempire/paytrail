import "server-only";

// Plans, with how many businesses are on each (any status: a plan can only be
// deleted when nobody is) and how many of those pay. Shared by Admin → Plans
// and the co-founder's Plans & prices page.
export async function loadPlans(ctx) {
  const [{ data: plans }, usageRes] = await Promise.all([
    ctx.supabase.from("plans").select("*").order("sort_order").order("price_minor"),
    ctx.supabase.rpc("plan_usage"),
  ]);
  const counts = {}, usage = {};
  if (!usageRes.error) {
    for (const r of usageRes.data || []) { usage[r.plan_id] = Number(r.businesses); counts[r.plan_id] = Number(r.paying); }
  } else if (ctx.isPlatformAdmin) {
    // before RUN_NEW_2026-11-12b.sql: admins can still count from the businesses table
    const { data: subs } = await ctx.supabase.from("businesses").select("plan_id, subscription_status").not("plan_id", "is", null);
    for (const b of subs || []) { usage[b.plan_id] = (usage[b.plan_id] || 0) + 1; if (b.subscription_status === "active") counts[b.plan_id] = (counts[b.plan_id] || 0) + 1; }
  }
  return { plans: plans || [], counts, usage };
}
