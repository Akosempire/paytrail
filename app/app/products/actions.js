"use server";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { toMinor } from "@/lib/money";

const EDITORS = ["owner", "manager", "finance"];
const CATS = ["standard", "zero", "exempt"];
const missingTable = (e) => /products/.test(e?.message || "") && /(does not exist|schema cache|relation)/i.test(e?.message || "");
const SQL_HINT = "Products need the latest database update: run RUN_NEW_2026-11-01c.sql in Supabase first.";

// For the invoice editor (Stream A): saved products whose name or description
// matches q, best first. Empty q gives the most recently changed ones.
// Returns [{ id, name, description, unit, unit_price_minor, vat_category }].
export async function searchProducts(q = "") {
  const ctx = await requireBusiness();
  const term = String(q || "").replace(/[%,()]/g, " ").trim().slice(0, 80);
  let query = ctx.supabase.from("products").select("id, name, description, unit, unit_price_minor, vat_category")
    .eq("business_id", ctx.business.id).is("archived_at", null).limit(term ? 40 : 8);
  query = term ? query.or(`name.ilike.%${term}%,description.ilike.%${term}%`) : query.order("updated_at", { ascending: false });
  const { data, error } = await query;
  if (error) return [];
  const t = term.toLowerCase();
  const rank = (p) => { const n = p.name.toLowerCase(); return n.startsWith(t) ? 0 : n.split(/\s+/).some((w) => w.startsWith(t)) ? 1 : n.includes(t) ? 2 : 3; };
  const rows = (data || []).map((p) => ({ ...p, unit_price_minor: Number(p.unit_price_minor) }));
  return term ? rows.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, 8) : rows;
}

export async function saveProduct(id, form) {
  const ctx = await requireBusiness();
  if (!EDITORS.includes(ctx.member?.role)) return { error: "Only owners, managers and finance can change products." };
  const price = toMinor(form.price);
  const row = {
    name: String(form.name || "").trim().slice(0, 300),
    description: String(form.description || "").trim().slice(0, 1000),
    unit: String(form.unit || "").trim().slice(0, 20),
    unit_price_minor: price,
    vat_category: CATS.includes(form.vat_category) ? form.vat_category : "standard",
    updated_at: new Date().toISOString(),
  };
  if (!row.name) return { error: "Enter a name." };
  if (!Number.isSafeInteger(price) || price < 0) return { error: "Enter the price as a number, like 15000 or 15000.50." };
  const { error } = id
    ? await ctx.supabase.from("products").update(row).eq("id", id).eq("business_id", ctx.business.id)
    : await ctx.supabase.from("products").insert({ ...row, business_id: ctx.business.id });
  if (error) return { error: missingTable(error) ? SQL_HINT : "Could not save the product." };
  revalidatePath("/app/products");
  return { message: id ? "Product updated." : "Product added. It'll be suggested when you add items to an invoice." };
}

export async function archiveProduct(id, archived = true) {
  const ctx = await requireBusiness();
  if (!EDITORS.includes(ctx.member?.role)) return { error: "Only owners, managers and finance can change products." };
  const { error } = await ctx.supabase.from("products").update({ archived_at: archived ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("id", id).eq("business_id", ctx.business.id);
  if (error) return { error: "Could not change the product." };
  revalidatePath("/app/products");
  return { message: archived ? "Product archived. Invoices that use it are unchanged." : "Product restored." };
}
