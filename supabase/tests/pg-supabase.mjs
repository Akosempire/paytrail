// LOCAL TESTS ONLY. A stand-in for the Supabase service client that runs the
// same queries against the local Postgres (as service_role), so server code
// written for supabase-js can be tested against the real schema and functions.
// Covers the query-builder calls lib/ai uses; anything else throws.
import pg from "pg";

// PostgREST returns dates and timestamps as text, not Date objects
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1114, (v) => v);
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());

const ident = (s) => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(s)) throw new Error(`pg-supabase: bad identifier ${s}`);
  return `"${s}"`;
};
const cols = (s) => (!s || s.trim() === "*" ? "*" : s.split(",").map((c) => ident(c.trim())).join(", "));

class Query {
  constructor(pool, table) {
    Object.assign(this, { pool, table, op: "select", columns: "*", where: [], params: [], orders: [], lim: null, returning: null, count: null, head: false, one: null });
  }
  p(v) { this.params.push(v); return `$${this.params.length}`; }
  select(c = "*", opts = {}) {
    if (this.op === "select") { this.columns = c; this.count = opts.count || null; this.head = Boolean(opts.head); } else this.returning = c;
    return this;
  }
  insert(rows) { this.op = "insert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows) { this.op = "upsert"; this.rows = Array.isArray(rows) ? rows : [rows]; return this; }
  update(v) { this.op = "update"; this.values = v; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.where.push(`${ident(c)} = ${this.p(v)}`); return this; }
  neq(c, v) { this.where.push(`${ident(c)} <> ${this.p(v)}`); return this; }
  gt(c, v) { this.where.push(`${ident(c)} > ${this.p(v)}`); return this; }
  gte(c, v) { this.where.push(`${ident(c)} >= ${this.p(v)}`); return this; }
  lt(c, v) { this.where.push(`${ident(c)} < ${this.p(v)}`); return this; }
  ilike(c, v) { this.where.push(`${ident(c)} ilike ${this.p(v)}`); return this; }
  in(c, list) { this.where.push(`${ident(c)} = any(${this.p(list)})`); return this; }
  is(c, v) { if (v !== null) throw new Error("pg-supabase: is() only supports null"); this.where.push(`${ident(c)} is null`); return this; }
  not(c, op, v) { if (op !== "is" || v !== null) throw new Error("pg-supabase: not() only supports is null"); this.where.push(`${ident(c)} is not null`); return this; }
  or(expr) {
    const parts = expr.split(",").map((part) => {
      const [c, op, ...rest] = part.split(".");
      const v = rest.join(".");
      if (op === "ilike") return `${ident(c)}::text ilike ${this.p(v)}`;
      if (op === "eq") return `${ident(c)}::text = ${this.p(v)}`;
      throw new Error(`pg-supabase: or() op ${op}`);
    });
    this.where.push(`(${parts.join(" or ")})`);
    return this;
  }
  order(c, { ascending = true } = {}) { this.orders.push(`${ident(c)} ${ascending ? "asc" : "desc"}`); return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "single"; return this; }
  sql() {
    const w = this.where.length ? ` where ${this.where.join(" and ")}` : "";
    const t = `public.${ident(this.table)}`;
    if (this.op === "select") {
      if (this.head) return `select count(*)::int as n from ${t}${w}`;
      return `select ${cols(this.columns)} from ${t}${w}${this.orders.length ? ` order by ${this.orders.join(", ")}` : ""}${this.lim ? ` limit ${Number(this.lim)}` : ""}`;
    }
    const ret = this.returning ? ` returning ${cols(this.returning)}` : "";
    if (this.op === "insert" || this.op === "upsert") {
      const keys = Object.keys(this.rows[0]);
      const values = this.rows.map((r) => `(${keys.map((k) => this.p(r[k])).join(", ")})`).join(", ");
      const conflict = this.op === "upsert" ? ` on conflict (id) do update set ${keys.filter((k) => k !== "id").map((k) => `${ident(k)} = excluded.${ident(k)}`).join(", ")}` : "";
      return `insert into ${t} (${keys.map(ident).join(", ")}) values ${values}${conflict}${ret}`;
    }
    if (this.op === "update") {
      const set = Object.entries(this.values).map(([k, v]) => `${ident(k)} = ${this.p(v)}`).join(", ");
      return `update ${t} set ${set}${w}${ret}`;
    }
    if (this.op === "delete") return `delete from ${t}${w}${ret}`;
    throw new Error("pg-supabase: unknown op");
  }
  async run() {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role service_role");
      const r = await client.query(this.sql(), this.params);
      await client.query("commit");
      if (this.head) return { data: null, count: r.rows[0].n, error: null };
      let data = this.op === "select" || this.returning ? r.rows : null;
      if (this.one) {
        if (data.length > 1 || (this.one === "single" && data.length === 0)) return { data: null, error: { message: `expected one row, got ${data.length}` } };
        data = data[0] ?? null;
      }
      return { data, error: null };
    } catch (e) {
      await client.query("rollback").catch(() => null);
      return { data: null, error: { message: e.message, code: e.code } };
    } finally { client.release(); }
  }
  then(ok, bad) { return this.run().then(ok, bad); }
}

export function pgSupabase(pool = new pg.Pool()) {
  return {
    pool,
    from: (table) => new Query(pool, table),
    async rpc(fn, args) {
      const keys = Object.keys(args || {});
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("set local role service_role");
        const r = await client.query(`select to_jsonb(public.${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ")})) as r`,
          keys.map((k) => (args[k] !== null && typeof args[k] === "object" ? JSON.stringify(args[k]) : args[k])));
        await client.query("commit");
        return { data: r.rows[0].r, error: null };
      } catch (e) {
        await client.query("rollback").catch(() => null);
        return { data: null, error: { message: e.message, code: e.code } };
      } finally { client.release(); }
    },
  };
}
