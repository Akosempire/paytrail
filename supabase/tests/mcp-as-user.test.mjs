// AI assistants act through mcp_as_user: the app's own actions, run as the
// person who connected the assistant, with all the app's rules applied.
import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const pool = new pg.Pool();
const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0];
async function as(role, userId, sql, params = []) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    if (userId) await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const r = await client.query(sql, params);
    await client.query("commit");
    return r;
  } catch (e) { await client.query("rollback"); throw e; } finally { client.release(); }
}
const viaAssistant = async (uid, fn, args) => (await as("service_role", null, "select public.mcp_as_user($1, $2, $3) r", [uid, fn, JSON.stringify(args)])).rows[0].r;

let owner, junior, stranger, biz;
test.before(async () => {
  const mk = async (n) => (await one("insert into auth.users(email) values ($1) returning id", [`${n}${Date.now()}@mcp.test`])).id;
  owner = await mk("owner"); junior = await mk("junior"); stranger = await mk("stranger");
  biz = (await as("authenticated", owner, "select public.create_business('freelancer','MCP Test','Ada','NGN') id")).rows[0].id;
  await pool.query("insert into public.memberships(business_id, user_id, role, email, full_name) values ($1,$2,'junior_finance','j@mcp.test','June')", [biz, junior]);
  await pool.query("update public.businesses set require_approval=true, onboarded_at=now() where id=$1", [biz]);
});
test.after(() => pool.end());

const draft = { kind: "invoice", customer: { name: "Obi Foods", email: "obi@foods.test" }, items: [{ description: "Logo design", quantity: 2, unit_price_minor: 5000000 }], due_date: "", valid_until: "", notes: "", terms: "", title: "", tax_rate: 0, tax_label: "", discount_minor: 0 };

test("the owner's assistant creates a draft invoice, as the owner", async () => {
  const id = await viaAssistant(owner, "save_document", { target: biz, doc_id: null, payload: draft });
  const d = await one("select kind, status, total_minor, created_by, customer_name from public.documents where id=$1", [id]);
  assert.equal(d.kind, "invoice"); assert.equal(d.status, "draft"); assert.equal(Number(d.total_minor), 10000000);
  assert.equal(d.created_by, owner); assert.equal(d.customer_name, "Obi Foods");
  const sent = await viaAssistant(owner, "mark_document_sent", { doc_id: id });
  assert.ok(sent);
  assert.equal((await one("select status from public.documents where id=$1", [id])).status, "sent");
  // the identity doesn't leak into the rest of the transaction
  assert.equal((await as("service_role", null, "select public.mcp_as_user($1,'business_allowance',$2) a, auth.uid() u", [owner, JSON.stringify({ target: biz })])).rows[0].u, null);
});

test("the app's rules still apply: a junior can draft but not send when approval is required", async () => {
  const id = await viaAssistant(junior, "save_document", { target: biz, doc_id: null, payload: draft });
  await assert.rejects(viaAssistant(junior, "mark_document_sent", { doc_id: id }));
  assert.equal((await one("select status from public.documents where id=$1", [id])).status, "draft");
});

test("someone outside the business gets nothing", async () => {
  await assert.rejects(viaAssistant(stranger, "save_document", { target: biz, doc_id: null, payload: draft }));
});

test("only listed actions, and only the server may call it", async () => {
  await assert.rejects(viaAssistant(owner, "delete_business", { target: biz }), /not available/);
  await assert.rejects(viaAssistant(null, "save_document", {}), /Not signed in/);
  await assert.rejects(as("authenticated", owner, "select public.mcp_as_user($1,'business_allowance',$2)", [owner, JSON.stringify({ target: biz })]), /permission denied/);
  await assert.rejects(as("authenticated", owner, "select * from public.oauth_tokens"), /permission denied/);
});

test("payments and arrays pass through with the right types", async () => {
  const id = await viaAssistant(owner, "save_document", { target: biz, doc_id: null, payload: draft });
  await viaAssistant(owner, "mark_document_sent", { doc_id: id });
  await viaAssistant(owner, "record_manual_payment", { doc_id: id, pay_method: "bank_transfer", pay_reference: "TRF-1", pay_amount: 4000000, pay_note: "", pay_date: null });
  const d = await one("select status, amount_paid_minor from public.documents where id=$1", [id]);
  assert.equal(d.status, "partially_paid"); assert.equal(Number(d.amount_paid_minor), 4000000);
  const q = await viaAssistant(owner, "queue_document_send", { doc_id: id, to_email: "obi@foods.test", cc: ["a@b.test"], subject: "Invoice", message: "Hi", include_pdf: true, send_at: null, mark_on_send: false });
  assert.equal(q.to, "obi@foods.test");
  assert.deepEqual((await one("select cc from public.document_sends where id=$1", [q.id])).cc, ["a@b.test"]);
});
