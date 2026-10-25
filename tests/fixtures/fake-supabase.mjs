// In-memory stand-in for the Supabase service client, for unit tests only.
// Tests put a fake on globalThis.__fakeDb = { tables: {...}, rpc: (name, args) => ... }.
class Q {
  constructor(db, table) { this.db = db; this.table = table; this.f = []; this.op = "select"; this.one = null; this.lim = null; this.ord = null; this.ret = false; }
  rows() { return (this.db.tables[this.table] ||= []); }
  select() { if (this.op !== "select") this.ret = true; return this; }
  insert(v) { this.op = "insert"; this.val = v; return this; }
  update(v) { this.op = "update"; this.val = v; return this; }
  delete() { this.op = "delete"; return this; }
  eq(c, v) { this.f.push((r) => r[c] === v); return this; }
  neq(c, v) { this.f.push((r) => r[c] !== v); return this; }
  gt(c, v) { this.f.push((r) => r[c] > v); return this; }
  lt(c, v) { this.f.push((r) => r[c] < v); return this; }
  in(c, l) { this.f.push((r) => l.includes(r[c])); return this; }
  not(c, op, v) { if (op === "is" && v === null) this.f.push((r) => r[c] != null); return this; }
  order(c, { ascending = true } = {}) { this.ord = [c, ascending]; return this; }
  limit(n) { this.lim = n; return this; }
  maybeSingle() { this.one = "maybe"; return this; }
  single() { this.one = "one"; return this; }
  run() {
    const all = this.rows();
    if (this.op === "insert") {
      const items = (Array.isArray(this.val) ? this.val : [this.val]).map((v) => ({ id: crypto.randomUUID(), created_at: new Date().toISOString(), status: "pending", ...v }));
      if (this.db.unique?.[this.table]) for (const it of items) for (const k of this.db.unique[this.table]) if (all.some((r) => r[k] === it[k])) return { data: null, error: { message: "duplicate key" } };
      all.push(...items);
      return { data: this.one ? items[0] : items, error: null };
    }
    let hit = all.filter((r) => this.f.every((fn) => fn(r)));
    if (this.op === "update") { hit.forEach((r) => Object.assign(r, this.val)); return { data: this.ret ? hit : null, error: null }; }
    if (this.op === "delete") { this.db.tables[this.table] = all.filter((r) => !hit.includes(r)); return { data: hit, error: null }; }
    if (this.ord) { const [c, a] = this.ord; hit = [...hit].sort((x, y) => (x[c] > y[c] ? 1 : -1) * (a ? 1 : -1)); }
    if (this.lim) hit = hit.slice(0, this.lim);
    if (this.one) return hit[0] || this.one === "maybe" ? { data: hit[0] || null, error: null } : { data: null, error: { message: "not found" } };
    return { data: hit, error: null };
  }
  then(res, rej) { try { res(this.run()); } catch (e) { rej(e); } }
}
const db = () => globalThis.__fakeDb || (() => { throw new Error("no fake database set up"); })();
export function createSupabaseService() {
  const d = db();
  return { from: (t) => new Q(d, t), rpc: async (name, args) => d.rpc(name, args) };
}
export async function createSupabaseServer() { return createSupabaseService(); }
export function supabaseConfigured() { return true; }
