// Database rule tests. Runs against a throwaway local Postgres that has
// 00_supabase_shim.sql and the migrations applied:
//   PGHOST=/tmp PGPORT=54322 PGUSER=postgres PGDATABASE=pt_test node --test supabase/tests/rules.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];

// runs fn inside a transaction as the given user (or service role when user is null)
async function as(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (userId === "service") await client.query("set local role service_role");
    else if (userId) {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    } else await client.query("set local role anon");
    const result = await fn({
      q: async (sql, params = []) => (await client.query(sql, params)).rows,
      one: async (sql, params = []) => (await client.query(sql, params)).rows[0],
    });
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

async function user(email) {
  return (await one("insert into auth.users(email) values ($1) returning id", [email])).id;
}

let owner, junior, finance, stranger, admin, biz, otherBiz;

test.before(async () => {
  const suffix = Date.now();
  owner = await user(`owner${suffix}@a.test`);
  junior = await user(`junior${suffix}@a.test`);
  finance = await user(`finance${suffix}@a.test`);
  stranger = await user(`stranger${suffix}@b.test`);
  admin = await user(`admin${suffix}@paytrail.test`);
  await pool.query("insert into public.platform_admins(user_id) values ($1)", [admin]);
  await pool.query("update public.platform_settings set trial_mode='documents', trial_documents=2");
});
test.after(() => pool.end());

test("signing up creates a business with its owner and a trial", async () => {
  biz = await as(owner, ({ one }) => one("select public.create_business('company','Adeyemi Studio','Tolu Adeyemi','NGN') id")).then(r => r.id);
  otherBiz = await as(stranger, ({ one }) => one("select public.create_business('freelancer','Other Co','Sam','NGN') id")).then(r => r.id);
  const b = await one("select * from public.businesses where id=$1", [biz]);
  assert.equal(b.subscription_status, "trialing");
  const m = await one("select role from public.memberships where business_id=$1 and user_id=$2", [biz, owner]);
  assert.equal(m.role, "owner");
});

test("invitations add members with the invited role only", async () => {
  const email = (await one("select email from auth.users where id=$1", [junior])).email;
  await as(owner, ({ q }) => q("insert into public.invitations(business_id,email,role,can_view_costs,token_hash,invited_by) values ($1,$2,'junior_finance',false,encode(digest('tok-junior','sha256'),'hex'),$3)", [biz, email, owner]));
  await as(junior, ({ q }) => q("select public.accept_invitation('tok-junior','Jide')"));
  const femail = (await one("select email from auth.users where id=$1", [finance])).email;
  await as(owner, ({ q }) => q("insert into public.invitations(business_id,email,role,can_view_costs,token_hash,invited_by) values ($1,$2,'finance',true,encode(digest('tok-fin','sha256'),'hex'),$3)", [biz, femail, owner]));
  // the wrong account cannot use someone else's invitation
  await assert.rejects(as(stranger, ({ q }) => q("select public.accept_invitation('tok-fin','x')")), /was sent to/);
  await as(finance, ({ q }) => q("select public.accept_invitation('tok-fin','Funmi')"));
  const roles = (await pool.query("select role from public.memberships where business_id=$1 order by role", [biz])).rows.map(r => r.role);
  assert.deepEqual(roles, ["finance", "junior_finance", "owner"]);
});

let quoteId;
test("a quote saves items and hidden costs; totals are computed by the database", async () => {
  quoteId = await as(owner, ({ one }) => one("select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({
    kind: "quote", title: "Website redesign",
    customer: { name: "Chioma Obi", company: "Obi Foods", email: "Chioma@obifoods.test" },
    tax_rate: 7.5, discount_minor: 1000000,
    items: [{ description: "Design", quantity: 1, unit_price_minor: 25000000 }, { description: "Build", quantity: 2, unit_price_minor: 10000000 }],
    costs: [{ label: "Data subscription", category: "data", amount_minor: 1500000 }, { label: "Electricity", category: "electricity", amount_minor: 800000 }],
  })])).then(r => r.id);
  const d = await one("select * from public.documents where id=$1", [quoteId]);
  assert.equal(d.number, "QT-0001");
  assert.equal(Number(d.subtotal_minor), 45000000);
  assert.equal(Number(d.tax_minor), Math.round((45000000 - 1000000) * 0.075));
  assert.equal(Number(d.total_minor), 44000000 + 3300000);
  assert.equal(d.customer_email, "chioma@obifoods.test");
});

test("hidden costs are invisible to junior finance and to other businesses", async () => {
  const juniorCosts = await as(junior, ({ q }) => q("select * from public.document_costs where document_id=$1", [quoteId]));
  assert.equal(juniorCosts.length, 0);
  const juniorItems = await as(junior, ({ q }) => q("select * from public.document_items where document_id=$1", [quoteId]));
  assert.equal(juniorItems.length, 2);
  const financeCosts = await as(finance, ({ q }) => q("select * from public.document_costs where document_id=$1", [quoteId]));
  assert.equal(financeCosts.length, 2);
  const strangerDocs = await as(stranger, ({ q }) => q("select * from public.documents where business_id=$1", [biz]));
  assert.equal(strangerDocs.length, 0);
  const anonDocs = await as(null, ({ q }) => q("select * from public.documents"));
  assert.equal(anonDocs.length, 0);
  // no direct writes, even for the owner
  await assert.rejects(as(owner, ({ q }) => q("update public.documents set total_minor=1 where id=$1 returning id", [quoteId]).then(r => { if (!r.length) throw new Error("blocked"); })), /blocked|permission/);
});

test("a junior edit cannot wipe hidden costs it cannot see", async () => {
  const draft = await as(junior, ({ one }) => one("select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({
    kind: "invoice", customer: { name: "Bola" }, items: [{ description: "Logo", quantity: 1, unit_price_minor: 5000000 }],
    costs: [{ label: "sneaky", amount_minor: 1 }],
  })])).then(r => r.id);
  assert.equal(Number((await one("select count(*) n from public.document_costs where document_id=$1", [draft])).n), 0);
  await as(owner, ({ q }) => q("select public.save_document($1,$2,$3::jsonb)", [biz, draft, JSON.stringify({ costs: [{ label: "Transport", category: "transport", amount_minor: 300000 }] })]));
  await as(junior, ({ q }) => q("select public.save_document($1,$2,$3::jsonb)", [biz, draft, JSON.stringify({ items: [{ description: "Logo v2", quantity: 1, unit_price_minor: 6000000 }], costs: [] })]));
  assert.equal(Number((await one("select count(*) n from public.document_costs where document_id=$1", [draft])).n), 1);
  // junior cannot send without approval, but can submit
  await assert.rejects(as(junior, ({ q }) => q("select public.mark_document_sent($1)", [draft])), /approve/);
  await as(junior, ({ q }) => q("select public.submit_document($1)", [draft]));
  const allowance = await as(finance, ({ one }) => one("select public.mark_document_sent($1) a", [draft]));
  assert.equal(allowance.a.used, 1);
  const d = await one("select status, approved_by from public.documents where id=$1", [draft]);
  assert.equal(d.status, "sent");
  assert.equal(d.approved_by, finance);
});

test("the trial allows two documents, then asks for a plan", async () => {
  await as(owner, ({ q }) => q("select public.mark_document_sent($1)", [quoteId]));
  const third = await as(owner, ({ one }) => one("select public.save_document($1,null,$2::jsonb) id", [biz, JSON.stringify({ kind: "quote", customer: { name: "Ken" }, items: [{ description: "x", quantity: 1, unit_price_minor: 100 }] })])).then(r => r.id);
  await assert.rejects(as(owner, ({ q }) => q("select public.mark_document_sent($1)", [third])), /ALLOWANCE:trial_used/);
  // owner cannot hand themselves a plan
  await as(owner, ({ q }) => q("update public.businesses set subscription_status='active', trial_documents_used=0, name='Adeyemi Studio Ltd' where id=$1", [biz]));
  const b = await one("select subscription_status, trial_documents_used, name from public.businesses where id=$1", [biz]);
  assert.equal(b.subscription_status, "trialing");
  assert.equal(b.trial_documents_used, 2);
  assert.equal(b.name, "Adeyemi Studio Ltd");
  // the platform owner activates a plan with a monthly limit
  const plan = await as(admin, ({ one }) => one("insert into public.plans(name, price_minor, document_limit, seat_limit) values ('Starter', 500000, 4, 5) returning id")).then(r => r.id);
  await as(admin, ({ q }) => q("update public.businesses set plan_id=$2, subscription_status='active', current_period_end=now()+interval '30 days' where id=$1", [biz, plan]));
  await as(owner, ({ q }) => q("select public.mark_document_sent($1)", [third]));
});

test("customer accepts; payment settles once and issues a receipt on an invoice", async () => {
  const token = (await one("select access_token from public.documents where id=$1", [quoteId])).access_token;
  await as("service", ({ q }) => q("select public.customer_respond($1, true, 'Chioma Obi', '')", [token]));
  const total = Number((await one("select total_minor from public.documents where id=$1", [quoteId])).total_minor);
  const attempt = (await one("insert into public.payment_attempts(business_id, document_id, provider, purpose, reference, amount_minor, currency) values ($1,$2,'flutterwave','document','PT-TEST-1',$3,'NGN') returning id", [biz, quoteId, total])).id;
  const pay = (sql) => as("service", ({ one }) => one(sql, [quoteId, total, attempt]));
  const p1 = await pay("select public.apply_payment($1,'flutterwave','FLW-1',$2,'NGN','',$3,null) id");
  const p2 = await pay("select public.apply_payment($1,'flutterwave','FLW-1',$2,'NGN','',$3,null) id");
  assert.equal(p1.id, p2.id, "a replayed webhook must not pay twice");
  const q = await one("select status, converted_invoice_id from public.documents where id=$1", [quoteId]);
  assert.equal(q.status, "accepted");
  const inv = await one("select * from public.documents where id=$1", [q.converted_invoice_id]);
  assert.equal(inv.kind, "invoice");
  assert.equal(inv.status, "paid");
  assert.equal(Number((await one("select count(*) n from public.document_costs where document_id=$1", [inv.id])).n), 2, "costs follow the quote to the invoice");
  const receipts = (await pool.query("select number from public.receipts where document_id=$1", [inv.id])).rows;
  assert.deepEqual(receipts.map(r => r.number), ["RCT-0001"]);
  // the invoice did not use another document from the allowance
  assert.equal(inv.counted_toward_allowance, false);
});

test("part payments by bank transfer; finance can record, junior cannot", async () => {
  const id = await as(finance, ({ one }) => one("select public.save_document($1,null,$2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", customer: { name: "Ada" }, items: [{ description: "Retainer", quantity: 1, unit_price_minor: 1000000 }] })])).then(r => r.id);
  await as(finance, ({ q }) => q("select public.mark_document_sent($1)", [id]));
  await assert.rejects(as(junior, ({ q }) => q("select public.record_manual_payment($1,'bank_transfer','',400000,'',null)", [id])), /Not allowed/);
  await as(finance, ({ q }) => q("select public.record_manual_payment($1,'bank_transfer','GTB-99',400000,'first half',null)", [id]));
  let d = await one("select status, amount_paid_minor from public.documents where id=$1", [id]);
  assert.equal(d.status, "partially_paid");
  await assert.rejects(as(finance, ({ q }) => q("select public.record_manual_payment($1,'cash','',700000,'',null)", [id])), /more than the balance/);
  await as(finance, ({ q }) => q("select public.record_manual_payment($1,'cash','',600000,'',null)", [id]));
  d = await one("select status from public.documents where id=$1", [id]);
  assert.equal(d.status, "paid");
  const r = (await pool.query("select number, balance_after_minor from public.receipts where document_id=$1 order by issued_at", [id])).rows;
  assert.equal(r.length, 2);
  assert.equal(Number(r[1].balance_after_minor), 0);
});

test("stored payment secrets are never readable from the browser", async () => {
  await pool.query("insert into public.payment_connections(business_id, provider, secret_key_enc, key_hint) values ($1,'bachs','enc:secret','1234')", [biz]);
  await assert.rejects(as(owner, ({ q }) => q("select secret_key_enc from public.payment_connections")), /permission denied/);
  const rows = await as(owner, ({ q }) => q("select key_hint from public.payment_connections"));
  assert.equal(rows[0].key_hint, "1234");
  const juniorRows = await as(junior, ({ q }) => q("select key_hint from public.payment_connections"));
  assert.equal(juniorRows.length, 0);
});

test("dashboard summary hides cost totals from members who cannot see costs", async () => {
  const forOwner = await as(owner, ({ one }) => one("select public.business_summary($1) s", [biz]));
  assert.ok(forOwner.s.paid_month_costs_minor > 0);
  const forJunior = await as(junior, ({ one }) => one("select public.business_summary($1) s", [biz]));
  assert.equal(forJunior.s.paid_month_costs_minor, null);
  await assert.rejects(as(stranger, ({ q }) => q("select public.business_summary($1)", [biz])), /Not allowed/);
});

test("managers cannot demote or remove the owner", async () => {
  await as(owner, ({ q }) => q("update public.memberships set role='manager' where business_id=$1 and user_id=$2", [biz, finance]));
  await as(finance, ({ q }) => q("update public.memberships set role='junior_finance' where business_id=$1 and user_id=$2", [biz, owner]));
  await as(finance, ({ q }) => q("delete from public.memberships where business_id=$1 and user_id=$2", [biz, owner]));
  assert.equal((await one("select role from public.memberships where business_id=$1 and user_id=$2", [biz, owner])).role, "owner");
});

test("plan monthly limit blocks the next send", async () => {
  const id = await as(owner, ({ one }) => one("select public.save_document($1,null,$2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", customer: { name: "Zed" }, items: [{ description: "y", quantity: 1, unit_price_minor: 100 }] })])).then(r => r.id);
  await assert.rejects(as(owner, ({ q }) => q("select public.mark_document_sent($1)", [id])), /ALLOWANCE:plan_limit/);
});

test("subscription payments extend the period and are idempotent", async () => {
  const plan = (await one("select id from public.plans where name='Starter'")).id;
  const attempt = (await one("insert into public.payment_attempts(business_id, provider, purpose, reference, amount_minor, currency, plan_id) values ($1,'bachs','subscription','PTSUB-1',500000,'NGN',$2) returning id", [otherBiz, plan])).id;
  const first = await as("service", ({ one }) => one("select public.activate_subscription($1) t", [attempt]));
  const again = await as("service", ({ one }) => one("select public.activate_subscription($1) t", [attempt]));
  assert.equal(String(first.t), String(again.t));
  const b = await one("select subscription_status from public.businesses where id=$1", [otherBiz]);
  assert.equal(b.subscription_status, "active");
  await assert.rejects(as(stranger, ({ q }) => q("select public.admin_extend_subscription($1,$2,'x',0)", [otherBiz, plan])), /Not allowed/);
  await as(admin, ({ q }) => q("select public.admin_extend_subscription($1,$2,'BANK-1',null)", [otherBiz, plan]));
  assert.equal(Number((await one("select count(*) n from public.subscription_payments where business_id=$1", [otherBiz])).n), 2);
});

test("members can't write the audit log directly", async () => {
  await assert.rejects(as(junior, ({ q }) => q("insert into public.activity(business_id, actor_id, action) values ($1,$2,'note')", [biz, junior])), /row-level security|permission/);
  await assert.rejects(as(junior, ({ q }) => q("insert into public.activity(business_id, actor_id, action) values ($1,$2,'note')", [biz, owner])), /row-level security/);
  await assert.rejects(as(stranger, ({ q }) => q("insert into public.activity(business_id, actor_id, action) values ($1,$2,'note')", [biz, stranger])), /row-level security/);
});

test("managers can't promote, graft users, or invite managers; signed-out callers get nothing", async () => {
  // finance was promoted to manager earlier; junior is still junior
  await assert.rejects(as(finance, ({ q }) => q("update public.memberships set role='manager', can_view_costs=true where business_id=$1 and user_id=$2", [biz, junior])), /row-level security/);
  assert.equal((await one("select role from public.memberships where business_id=$1 and user_id=$2", [biz, junior])).role, "junior_finance");
  await assert.rejects(as(finance, ({ q }) => q("update public.memberships set user_id=$3 where business_id=$1 and user_id=$2", [biz, junior, stranger])), /permission denied/);
  await assert.rejects(as(finance, ({ q }) => q("insert into public.invitations(business_id,email,role,token_hash,invited_by) values ($1,'x@y.z','manager','h1',$2)", [biz, finance])), /row-level security/);
  await as(finance, ({ q }) => q("insert into public.invitations(business_id,email,role,token_hash,invited_by) values ($1,'x@y.z','finance','h2',$2)", [biz, finance]));
  await assert.rejects(as(null, ({ q }) => q("select public.business_allowance($1)", [biz])), /permission denied/);
  await assert.rejects(as(stranger, ({ q }) => q("select public.recalculate_document($1)", [quoteId])), /permission denied/);
  await assert.rejects(as(null, ({ q }) => q("select public.void_document($1)", [quoteId])), /permission denied/);
});

test("an approver can't send a version they didn't review", async () => {
  const id = await as(junior, ({ one }) => one("select public.save_document($1,null,$2::jsonb) id", [biz, JSON.stringify({ kind: "quote", customer: { name: "Vee" }, items: [{ description: "a", quantity: 1, unit_price_minor: 100 }] })])).then(r => r.id);
  await as(junior, ({ q }) => q("select public.submit_document($1)", [id]));
  const seen = (await one("select updated_at from public.documents where id=$1", [id])).updated_at;
  await as(junior, ({ q }) => q("select public.save_document($1,$2,$3::jsonb)", [biz, id, JSON.stringify({ items: [{ description: "a", quantity: 1, unit_price_minor: 99999 }] })]));
  await assert.rejects(as(owner, ({ q }) => q("select public.mark_document_sent($1,$2)", [id, seen])), /changed since you opened it/);
});

test("Stripe and Paystack payments settle like the others", async () => {
  await pool.query("insert into public.payment_connections(business_id, provider, mode) values ($1,'stripe','live'), ($1,'paystack','live')", [biz]);
  const id = await as(owner, ({ one }) => one("select public.save_document($1,null,$2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", customer: { name: "Jane Doe" }, items: [{ description: "Consulting", quantity: 1, unit_price_minor: 50000 }] })])).then(r => r.id);
  await pool.query("update public.documents set currency='USD', sent_at=now(), status='sent' where id=$1", [id]);
  const total = Number((await one("select total_minor from public.documents where id=$1", [id])).total_minor);
  const attempt = (await one("insert into public.payment_attempts(business_id, document_id, provider, purpose, reference, amount_minor, currency) values ($1,$2,'stripe','document','PT-STRIPE-1',$3,'USD') returning id", [biz, id, total])).id;
  await as("service", ({ q }) => q("select public.apply_payment($1,'stripe','pi_123',$2,'USD','',$3,null)", [id, total, attempt]));
  assert.equal((await one("select status from public.documents where id=$1", [id])).status, "paid");
  await pool.query("update public.platform_settings set billing_provider='stripe'");
  await pool.query("update public.platform_settings set billing_provider='paystack'");
});

test("default pricing: paid plans only, founding plan hidden, zero-priced plans never expire", async () => {
  const plans = (await pool.query("select name, currency, billing_interval, price_minor, active from public.plans where name <> 'Starter' order by sort_order")).rows;
  assert.ok(plans.filter((p) => p.active).length >= 12, "default naira and dollar plans are seeded");
  assert.ok(!plans.some((p) => p.active && Number(p.price_minor) === 0), "no free-forever plan is offered");
  assert.ok(plans.some((p) => p.name === "Founding" && p.active === false && Number(p.price_minor) === 6000000));
  const free = (await one("insert into public.plans(name, price_minor, currency, document_limit) values ('Free test', 0, 'NGN', 5) returning id")).id;
  const ends = await as("service", ({ one }) => one("select public.extend_subscription($1,$2,'free','',0,'NGN',null) t", [otherBiz, free]));
  assert.equal(ends.t, null);
  const b = await one("select subscription_status, current_period_end from public.businesses where id=$1", [otherBiz]);
  assert.equal(b.subscription_status, "active");
  assert.equal(b.current_period_end, null);
  const a = await as(stranger, ({ one }) => one("select public.business_allowance($1) a", [otherBiz]));
  assert.equal(a.a.limit, 5);
});
