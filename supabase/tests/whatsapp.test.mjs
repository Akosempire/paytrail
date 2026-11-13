// WhatsApp to invoice (20261114000100_whatsapp.sql): people see and remove only
// their own linked numbers; codes, sessions and messages are server-only; the
// keys never reach signed-in users; WhatsApp is a paid feature.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
async function as(userId, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const r = await client.query(sql, params);
    await client.query("commit");
    return r;
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}
const stamp = `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const user = async (tag) => (await one("insert into auth.users(email, email_confirmed_at) values ($1, now()) returning id", [`${tag}${stamp}@wa.test`])).id;

let owner, other, biz, phoneA, phoneB;
test.before(async () => {
  owner = await user("owner"); other = await user("other");
  biz = (await one("insert into public.businesses(name, kind, currency) values ('WA Test Ltd', 'company', 'NGN') returning id")).id;
  await pool.query("insert into public.memberships(business_id, user_id, role) values ($1, $2, 'owner')", [biz, owner]);
  phoneA = `23480${String(stamp).slice(-8)}`; phoneB = `23490${String(stamp).slice(-8)}`;
  await pool.query("insert into public.whatsapp_links(phone, user_id, business_id) values ($1, $2, $3), ($4, $5, $3)", [phoneA, owner, biz, phoneB, other]);
});
test.after(() => pool.end());

test("people see and remove only their own linked numbers", async () => {
  const mine = (await as(owner, "select phone from public.whatsapp_links")).rows.map((r) => r.phone);
  assert.deepEqual(mine, [phoneA]);
  await as(owner, "delete from public.whatsapp_links where phone = $1", [phoneB]);
  assert.equal((await one("select count(*)::int n from public.whatsapp_links where phone = $1", [phoneB])).n, 1, "someone else's stays");
  await assert.rejects(as(owner, "insert into public.whatsapp_links(phone, user_id, business_id) values ('2348000000001', $1, $2)", [owner, biz]), /permission denied/, "linking happens on the server");
  await assert.rejects(as(owner, "update public.whatsapp_links set user_id = $1", [owner]), /permission denied/);
  await as(owner, "delete from public.whatsapp_links where phone = $1", [phoneA]);
  assert.equal((await one("select count(*)::int n from public.whatsapp_links where phone = $1", [phoneA])).n, 0);
});

test("codes, sessions and messages are server-only", async () => {
  await pool.query("insert into public.whatsapp_link_codes(code_hash, user_id, business_id, expires_at) values ($1, $2, $3, now() + interval '10 minutes')", [`h${stamp}`, owner, biz]);
  for (const t of ["whatsapp_link_codes", "whatsapp_sessions", "whatsapp_messages"]) await assert.rejects(as(owner, `select * from public.${t}`), /permission denied/, t);
});

test("one number links to one person; Twilio retries are stored once", async () => {
  await assert.rejects(pool.query("insert into public.whatsapp_links(phone, user_id, business_id) values ($1, $2, $3)", [phoneB, owner, biz]), /duplicate/);
  await assert.rejects(pool.query("insert into public.whatsapp_links(phone, user_id, business_id) values ('+234801', $1, $2)", [owner, biz]), /check/);
  await pool.query("insert into public.whatsapp_messages(message_sid, phone, direction) values ($1, $2, 'in')", [`SM${stamp}`, phoneB]);
  await assert.rejects(pool.query("insert into public.whatsapp_messages(message_sid, phone, direction) values ($1, $2, 'in')", [`SM${stamp}`, phoneB]), /duplicate/);
});

test("the Twilio token and AI key never reach signed-in users", async () => {
  await assert.rejects(as(owner, "select wa_auth_token_enc from public.platform_settings"), /permission denied/);
  await assert.rejects(as(owner, "select wa_ai_key_enc from public.platform_settings"), /permission denied/);
});

test("WhatsApp is a paid feature: the trial has it, a business on Free doesn't", async () => {
  const f = (await as(owner, "select public.business_features($1) f", [biz])).rows[0].f;
  const reason = (await as(owner, "select public.business_allowance($1) a", [biz])).rows[0].a?.reason;
  if (reason === "trial") assert.ok(f.includes("whatsapp"));
  if (["free", "free_limit"].includes(reason)) assert.ok(!f.includes("whatsapp"));
  assert.deepEqual((await as(other, "select public.business_features($1) f", [biz])).rows[0].f, [], "not a member");
});

test("cleanup blanks old message text and drops old codes", async () => {
  await pool.query("insert into public.whatsapp_messages(phone, direction, body, created_at) values ($1, 'in', 'old secret', now() - interval '40 days')", [phoneB]);
  await pool.query("insert into public.whatsapp_link_codes(code_hash, user_id, business_id, expires_at) values ($1, $2, $3, now() - interval '3 days')", [`old${stamp}`, owner, biz]);
  await pool.query("select public.whatsapp_cleanup()");
  assert.equal((await one("select count(*)::int n from public.whatsapp_messages where body = 'old secret'")).n, 0);
  assert.equal((await one("select count(*)::int n from public.whatsapp_link_codes where code_hash = $1", [`old${stamp}`])).n, 0);
  await assert.rejects(as(owner, "select public.whatsapp_cleanup()"), /permission denied/);
});
