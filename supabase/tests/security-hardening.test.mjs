// Security review, 3 Nov 2026 (20261103000300_security_hardening.sql)
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
const user = async (tag) => (await one("insert into auth.users(email) values ($1) returning id", [`${tag}${Date.now()}${Math.random()}@sec.test`])).id;
const business = async (owner, name) => (await as(owner, "select public.create_business('freelancer',$1,'Ada','NGN') id", [name])).rows[0].id;
const invoice = async (owner, biz) => (await as(owner, "select public.save_document($1, null, $2::jsonb) id", [biz, JSON.stringify({ kind: "invoice", customer: { name: "Sec Co" }, items: [{ description: "Work", quantity: 1, unit_price_minor: 1000 }] })])).rows[0].id;

let owner, biz, other, otherBiz;
test.before(async () => {
  owner = await user("sec-a"); biz = await business(owner, "Sec A");
  other = await user("sec-b"); otherBiz = await business(other, "Sec B");
  await pool.query("update public.businesses set onboarded_at = now(), bank_account_number = '0000000001' where id in ($1, $2)", [biz, otherBiz]);
});
test.after(() => pool.end());

test("clearing onboarded_at doesn't skip the bank-details code", async () => {
  await as(owner, "update public.businesses set onboarded_at = null where id = $1", [biz]);
  assert.ok((await one("select onboarded_at from public.businesses where id = $1", [biz])).onboarded_at, "onboarded_at stays");
  await assert.rejects(as(owner, "update public.businesses set bank_account_number = '9999999999' where id = $1", [biz]), /STEP_UP:bank_details/);
  assert.equal((await one("select bank_account_number from public.businesses where id = $1", [biz])).bank_account_number, "0000000001");
});

test("logos and signatures must be the business's own uploads, not web addresses", async () => {
  for (const bad of ["http://169.254.169.254/latest/meta-data", "https://evil.example/x.png", `${otherBiz}/logo-1.png`, `r2:${otherBiz}/logo-1.png`])
    await assert.rejects(as(owner, "update public.businesses set logo_path = $2 where id = $1", [biz, bad]), /Logo must be uploaded/, bad);
  await assert.rejects(as(owner, "update public.businesses set signature_path = 'http://localhost/x' where id = $1", [biz]), /Signature/);
  await as(owner, "update public.businesses set logo_path = $2, signature_path = $3 where id = $1", [biz, `r2:${biz}/logo-123.png`, `${biz}/signature-5.jpg`]);
  await as(owner, "update public.businesses set logo_path = null where id = $1", [biz]);
});

test("a file row can't point at another business's stored file", async () => {
  const mine = await invoice(owner, biz);
  const theirs = await invoice(other, otherBiz);
  const insert = (key) => as(owner, "insert into public.document_files(business_id,document_id,name,content_type,size_bytes,storage_key,uploaded_by) values ($1,$2,'x.pdf','application/pdf',10,$3,$4) returning id", [biz, mine, key, owner]);
  await assert.rejects(insert(`${otherBiz}/docs/${theirs}/abc.pdf`));
  await assert.rejects(insert(`${biz}/docs/${mine}/../../${otherBiz}/docs/${theirs}/abc.pdf`));
  const { rows: [{ id }] } = await insert(`${biz}/docs/${mine}/abc.pdf`);
  await assert.rejects(as(owner, "update public.document_files set storage_key = $2 where id = $1", [id, `${otherBiz}/docs/${theirs}/abc.pdf`]), /permission denied/);
  await as(owner, "update public.document_files set shared = true where id = $1", [id]);
});

test("offline sync records can't be planted from the browser", async () => {
  await assert.rejects(as(owner, "insert into public.offline_ops(id, business_id, user_id, kind, result) values ('op-1', $1, $2, 'x', '{}')", [biz, owner]));
});

test("targeted news doesn't reveal which other businesses got it", async () => {
  await pool.query("insert into public.announcements(title, active, published_at, audience, business_ids) values ('Sec news', true, now(), 'selected', array[$1::uuid, $2::uuid])", [biz, otherBiz]);
  try {
    await assert.rejects(as(owner, "select business_ids from public.announcements"), /permission denied/);
    const { rows } = await as(owner, "select title from public.news_for($1) where title = 'Sec news'", [biz]);
    assert.equal(rows.length, 1);
    assert.equal((await as(owner, "select * from public.news_for($1)", [otherBiz])).rows.length, 0, "not a member of the other business");
  } finally { await pool.query("delete from public.announcements where title = 'Sec news'"); }
});
