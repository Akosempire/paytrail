// LOCAL PREVIEW ONLY. When PAYTRAIL_PREVIEW=1 (and never in production), the
// app talks to this in-memory stand-in for Supabase instead of a real project,
// so every screen can be viewed with sample data. Writes are ignored.
import { fixtures } from "./preview-data";

// Optional simulated network delay per Supabase call, so speed tests behave
// like the real app: PAYTRAIL_PREVIEW_LATENCY_MS=100
export const previewLatency = () => Number(process.env.PAYTRAIL_PREVIEW_LATENCY_MS || 0);
const wait = () => new Promise((r) => setTimeout(r, previewLatency()));

export function previewEnabled() {
  return process.env.PAYTRAIL_PREVIEW === "1" && process.env.NODE_ENV !== "production";
}

class Query {
  constructor(table, rows) {
    this.table = table;
    this.rows = rows;
    this.filters = [];
    this.opts = {};
    this.limitN = null;
    this.orderBy = [];
    this.mode = "many";
    this.write = false;
  }
  select(_cols, opts = {}) { this.opts = opts; return this; }
  insert() { this.write = true; return this; }
  update() { this.write = true; return this; }
  upsert() { this.write = true; return this; }
  delete() { this.write = true; return this; }
  eq(c, v) { this.filters.push((r) => get(r, c) == v); return this; }
  neq(c, v) { this.filters.push((r) => get(r, c) != v); return this; }
  in(c, list) { this.filters.push((r) => list.includes(get(r, c))); return this; }
  is(c, v) { this.filters.push((r) => (v === null ? get(r, c) == null : get(r, c) === v)); return this; }
  not(c, op, v) { if (op === "is" && v === null) this.filters.push((r) => get(r, c) != null); return this; }
  lt(c, v) { this.filters.push((r) => get(r, c) != null && get(r, c) < v); return this; }
  lte(c, v) { this.filters.push((r) => get(r, c) != null && get(r, c) <= v); return this; }
  gt(c, v) { this.filters.push((r) => get(r, c) != null && get(r, c) > v); return this; }
  gte(c, v) { this.filters.push((r) => get(r, c) != null && get(r, c) >= v); return this; }
  ilike() { return this; }
  or(expr) {
    // supports the "id.eq.X,id.eq.Y" form used for related documents
    const ids = [...expr.matchAll(/id\.eq\.([0-9a-f-]{36})/g)].map((m) => m[1]);
    if (/active\.eq\.true/.test(expr)) this.filters.push((r) => r.active || ids.includes(r.id));
    else if (ids.length && !/status\./.test(expr)) this.filters.push((r) => ids.includes(r.id));
    if (/status\.eq\.pending_approval/.test(expr)) {
      const today = new Date().toISOString().slice(0, 10);
      this.filters.push((r) => r.status === "pending_approval" || (r.kind === "invoice" && ["sent", "viewed", "partially_paid"].includes(r.status) && r.due_date < today));
    }
    return this;
  }
  order(c, { ascending = true } = {}) { this.orderBy.push([c, ascending]); return this; }
  limit(n) { this.limitN = n; return this; }
  range(from, to) { this.rangeAB = [from, to]; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  run() {
    if (this.write) return { data: null, error: null };
    let out = this.rows.filter((r) => this.filters.every((f) => f(r)));
    for (const [c, asc] of [...this.orderBy].reverse()) out = [...out].sort((a, b) => (get(a, c) > get(b, c) ? 1 : get(a, c) < get(b, c) ? -1 : 0) * (asc ? 1 : -1));
    if (this.limitN) out = out.slice(0, this.limitN);
    if (this.rangeAB) out = out.slice(this.rangeAB[0], this.rangeAB[1] + 1);
    if (this.opts.head) return { data: null, count: out.length, error: null };
    if (this.mode === "single") return { data: out[0] ?? null, error: out[0] ? null : { message: "not found" } };
    if (this.mode === "maybe") return { data: out[0] ?? null, error: null };
    return { data: out, count: out.length, error: null };
  }
  then(resolve, reject) { wait().then(() => { try { resolve(this.run()); } catch (e) { reject(e); } }); }
}

function get(row, col) { return row[col]; }

export function createPreviewClient() {
  const f = fixtures();
  return {
    from: (table) => new Query(table, f.tables[table] || []),
    rpc: async (name, args) => { await wait(); const data = f.rpc(name, args); return data === undefined ? { data: null, error: { message: `preview: no rpc ${name}` } } : { data, error: null }; },
    auth: {
      getUser: async () => { await wait(); return { data: { user: f.user } }; },
      getClaims: async () => ({ data: { claims: { sub: f.user.id, email: f.user.email, user_metadata: f.user.user_metadata } }, error: null }),
      signOut: async () => ({}),
      signInWithPassword: async () => ({ error: null }),
      signUp: async () => ({ data: {}, error: null }),
      // preview: "000000" is a wrong code, anything else is accepted
      verifyOtp: async ({ token }) => { await wait(); return token === "000000" ? { error: { message: "Token has expired or is invalid" } } : { data: {}, error: null }; },
      resend: async () => ({ error: null }),
    },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  };
}
