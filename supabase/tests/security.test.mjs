// Emailed security codes: bank details need a verified code after onboarding.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
async function as(userId, sql, params = []) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("set local role authenticated");
    await c.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const r = (await c.query(sql, params)).rows[0];
    await c.query("commit");
    return r;
  } catch (e) { await c.query("rollback"); throw e; } finally { c.release(); }
}

let owner, biz;
test.before(async () => {
  owner = (await one("insert into auth.users(email) values ($1) returning id", [`sec${Date.now()}@a.test`])).id;
  biz = (await as(owner, "select public.create_business('freelancer','Sec Co','Ada','NGN') id")).id;
});
test.after(() => pool.end());

test("bank details can be set during onboarding without a code", async () => {
  await as(owner, "update public.businesses set bank_account_number='111' where id=$1", [biz]);
  assert.equal((await one("select bank_account_number n from public.businesses where id=$1", [biz])).n, "111");
});

test("after onboarding, changing bank details needs a verified code", async () => {
  await pool.query("update public.businesses set onboarded_at=now() where id=$1", [biz]);
  await assert.rejects(as(owner, "update public.businesses set bank_account_number='222' where id=$1", [biz]), /STEP_UP:bank_details/);
  // other fields still save without a code
  await as(owner, "update public.businesses set footer_note='hi' where id=$1", [biz]);
  // members can't read or forge codes
  await assert.rejects(as(owner, "insert into public.security_codes(user_id,business_id,purpose,code_hash,expires_at,verified_until) values ($1,$2,'bank_details','x',now(),now()+interval '1 hour')", [owner, biz]), /permission denied/);
  await assert.rejects(as(owner, "select * from public.security_codes"), /permission denied/);
});

test("a verified code (written by the server) opens a short window", async () => {
  await pool.query("insert into public.security_codes(user_id,business_id,purpose,code_hash,expires_at,used_at,verified_until) values ($1,$2,'bank_details','h',now(),now(),now()+interval '10 minutes')", [owner, biz]);
  await as(owner, "update public.businesses set bank_account_number='222' where id=$1", [biz]);
  assert.equal((await one("select bank_account_number n from public.businesses where id=$1", [biz])).n, "222");
  await pool.query("update public.security_codes set verified_until=now()-interval '1 second' where user_id=$1", [owner]);
  await assert.rejects(as(owner, "update public.businesses set bank_account_number='333' where id=$1", [biz]), /STEP_UP/);
});
