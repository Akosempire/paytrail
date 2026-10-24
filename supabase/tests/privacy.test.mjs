// Data protection rules: business deletion (30-day grace) and what survives it.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];

async function as(userId, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (userId === "service") await client.query("set local role service_role");
    else {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    }
    const rows = (await client.query(sql, params)).rows;
    await client.query("commit");
    return rows[0];
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

let owner, manager, biz, docId;
test.before(async () => {
  const s = Date.now();
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`del-owner${s}@a.test`])).id;
  manager = (await one("insert into auth.users(email) values ($1) returning id", [`del-mgr${s}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('company','Leaving Ltd','Ada','NGN') id")).id;
  await pool.query("insert into public.memberships(business_id,user_id,role,full_name) values ($1,$2,'manager','Mo')", [biz, manager]);
  await pool.query("update public.businesses set subscription_status='active', current_period_end=now()+interval '30 days' where id=$1", [biz]);
  await pool.query("insert into public.subscription_payments(business_id,method,amount_minor,currency,period_start,period_end) values ($1,'manual',750000,'NGN',now(),now()+interval '30 days')", [biz]);
  docId = (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", title: "Job", customer: { name: "Kay", email: "kay@c.test" }, items: [{ description: "Work", quantity: 1, unit_price_minor: 100000 }] })])).id;
});
test.after(() => pool.end());

test("only the owner can schedule deletion, and must type the business name", async () => {
  await assert.rejects(as(manager, "select public.request_business_deletion($1,'Leaving Ltd')", [biz]), /Only the owner/);
  await assert.rejects(as(owner, "select public.request_business_deletion($1,'Wrong name')", [biz]), /Type the business name/);
  const r = await as(owner, "select public.request_business_deletion($1,'  leaving ltd ') due", [biz]);
  const days = (new Date(r.due) - Date.now()) / 86400000;
  assert.ok(days > 29.9 && days < 30.1, `due in ${days} days`);
});

test("members can't change or clear the deletion date directly", async () => {
  await as(owner, "update public.businesses set deletion_requested_at=null, deletion_scheduled_for=now()+interval '1 year', name='Renamed' where id=$1", [biz]);
  const b = await one("select name, deletion_requested_at, deletion_scheduled_for from public.businesses where id=$1", [biz]);
  assert.equal(b.name, "Renamed");
  assert.ok(b.deletion_requested_at);
  assert.ok(b.deletion_scheduled_for < new Date(Date.now() + 31 * 86400000));
  await pool.query("update public.businesses set name='Leaving Ltd' where id=$1", [biz]);
});

test("a business waiting for deletion can't send", async () => {
  const a = await as(owner, "select public.business_allowance($1) a", [biz]);
  assert.equal(a.a.reason, "deletion_pending");
  await assert.rejects(as(owner, "select public.mark_document_sent($1)", [docId]), /ALLOWANCE:deletion_pending/);
});

test("purge does nothing before the date, cancel restores sending", async () => {
  assert.equal((await as("service", "select public.purge_business($1) p", [biz])).p, false);
  await assert.rejects(as(owner, "select public.purge_business($1)", [biz]), /permission denied/);
  await as(owner, "select public.cancel_business_deletion($1)", [biz]);
  const a = await as(owner, "select public.business_allowance($1) a", [biz]);
  assert.equal(a.a.allowed, true);
});

test("after 30 days everything is deleted except PayTrail's own billing record", async () => {
  await as(owner, "select public.request_business_deletion($1,'Leaving Ltd')", [biz]);
  await pool.query("update public.businesses set deletion_scheduled_for=now()-interval '1 minute' where id=$1", [biz]);
  assert.equal((await as("service", "select public.purge_business($1) p", [biz])).p, true);
  for (const t of ["businesses", "memberships", "customers", "documents", "document_items", "activity"]) {
    const col = t === "businesses" ? "id" : "business_id";
    assert.equal(Number((await one(`select count(*) n from public.${t} where ${col}=$1`, [biz])).n), 0, t);
  }
  const sp = await one("select business_id, business_name, amount_minor from public.subscription_payments where business_name='Leaving Ltd'");
  assert.equal(sp.business_id, null);
  assert.equal(Number(sp.amount_minor), 750000);
  // the people's own logins are untouched
  assert.ok(await one("select 1 from auth.users where id=$1", [owner]));
});
