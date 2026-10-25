import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";
import { r2DeletePrefix } from "@/lib/storage";

// Data protection helpers (NDPA 2023 / GDPR): a complete copy of a business's
// or a person's data, and the permanent removal of businesses whose 30-day
// deletion window has passed.

const PAGE = 1000;

// reads every row, a page at a time (Supabase returns at most 1000 per call)
async function all(build) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
}

// Everything the business has in Usetally, for its owner. Uses the owner's own
// session, so the database's security rules still apply. Payment keys are
// never included.
export async function exportBusinessData(ctx) {
  const db = ctx.supabase;
  const id = ctx.business.id;
  const of = (table, cols = "*", order = "created_at") => all(() => db.from(table).select(cols).eq("business_id", id).order(order));
  const [members, invitations, customers, documents, items, costs, presets, payments, receipts, connections, subscription, activity] = await Promise.all([
    of("memberships", "user_id, role, can_view_costs, full_name, email, created_at"),
    of("invitations", "email, role, can_view_costs, expires_at, accepted_at, revoked_at, created_at"),
    of("customers"),
    of("documents"),
    of("document_items", "*", "document_id"),
    of("document_costs", "*", "document_id"),
    of("cost_presets"),
    of("payments", "*", "paid_at"),
    of("receipts", "*", "issued_at"),
    of("payment_connections", "provider, mode, key_hint, enabled, payment_confirmed_at, webhook_confirmed_at, created_at"),
    of("subscription_payments", "plan_id, method, reference, amount_minor, currency, period_start, period_end, created_at"),
    of("activity"),
  ]);
  const { plans, ...business } = ctx.business;
  return {
    format: "usetally-export",
    version: 1,
    scope: "business",
    exported_at: new Date().toISOString(),
    exported_by: ctx.user.email,
    note: "Amounts are in minor units (kobo, cents). Divide by 100 for most currencies.",
    business: { ...business, plan: plans?.name || null },
    team: members,
    invitations,
    customers,
    documents: documents.map((d) => ({
      ...d,
      items: items.filter((i) => i.document_id === d.id),
      hidden_costs: costs.filter((c) => c.document_id === d.id),
    })),
    cost_presets: presets,
    payments,
    receipts,
    payment_connections: connections,
    paytrail_subscription_payments: subscription,
    activity,
  };
}

// What Usetally holds about the signed-in person themselves.
export async function exportMyData(ctx) {
  const db = ctx.supabase;
  const me = ctx.user.id;
  const [{ data: { user: full } = {} }, { data: profile }, memberships, activity] = await Promise.all([
    db.auth.getUser(), // the full account record (sign-up and last sign-in dates)
    db.from("profiles").select("full_name, created_at").eq("user_id", me).maybeSingle(),
    all(() => db.from("memberships").select("business_id, role, can_view_costs, full_name, email, created_at, businesses(name)").eq("user_id", me).order("created_at")),
    all(() => db.from("activity").select("business_id, document_id, action, detail, created_at").eq("actor_id", me).order("created_at")),
  ]);
  return {
    format: "usetally-export",
    version: 1,
    scope: "personal",
    exported_at: new Date().toISOString(),
    account: {
      id: me,
      email: ctx.user.email,
      full_name: profile?.full_name || "",
      created_at: full?.created_at || null,
      last_sign_in_at: full?.last_sign_in_at || null,
    },
    businesses: memberships.map(({ businesses, ...m }) => ({ ...m, business_name: businesses?.name || "" })),
    my_activity: activity,
  };
}

export function exportResponse(data, name) {
  const date = new Date().toISOString().slice(0, 10);
  const slug = String(name || "usetally").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "usetally";
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="usetally-${slug}-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}

// Run by the daily job: permanently removes businesses whose deletion date has
// passed, including their logo files.
export async function purgeDueBusinesses({ limit = 50 } = {}) {
  const service = createSupabaseService();
  const { data: due, error } = await service.from("businesses").select("id, name")
    .lte("deletion_scheduled_for", new Date().toISOString()).limit(limit);
  if (error) return [{ error: error.message }];
  const results = [];
  for (const b of due || []) {
    try {
      const { data: files } = await service.storage.from("logos").list(b.id, { limit: 100 });
      if (files?.length) await service.storage.from("logos").remove(files.map((f) => `${b.id}/${f.name}`));
      await r2DeletePrefix(`${b.id}/`).catch(() => 0);
      const { data: purged, error: purgeError } = await service.rpc("purge_business", { target: b.id });
      results.push({ id: b.id, purged: Boolean(purged), error: purgeError?.message });
    } catch (e) {
      results.push({ id: b.id, purged: false, error: String(e?.message || e) });
    }
  }
  return results;
}

// A person can delete their own login once they don't own a business that
// is still running (an owner deletes or schedules the business first).
export async function accountDeletionBlocker(ctx) {
  const { data } = await createSupabaseService().from("memberships")
    .select("business_id, businesses(name, deletion_requested_at)").eq("user_id", ctx.user.id).eq("role", "owner");
  const live = (data || []).filter((m) => !m.businesses?.deletion_requested_at);
  return live.length ? live.map((m) => m.businesses?.name || "a business") : null;
}
