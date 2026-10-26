"use server";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";

export async function saveCustomer(id, form) {
  const ctx = await requireBusiness();
  const row = {
    name: String(form.name || "").trim().slice(0, 120),
    company: String(form.company || "").trim().slice(0, 120),
    email: String(form.email || "").trim().toLowerCase().slice(0, 200),
    phone: String(form.phone || "").trim().slice(0, 40),
    address: String(form.address || "").trim().slice(0, 500),
    notes: String(form.notes || "").trim().slice(0, 2000),
    tax_id: String(form.tax_id || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 40),
    updated_at: new Date().toISOString(),
  };
  if (!row.name) return { error: "Enter a name." };
  if (row.email && !/^\S+@\S+\.\S+$/.test(row.email)) return { error: "That email doesn't look right." };
  const write = (r) => id
    ? ctx.supabase.from("customers").update(r).eq("id", id).eq("business_id", ctx.business.id)
    : ctx.supabase.from("customers").insert({ ...r, business_id: ctx.business.id });
  let { error } = await write(row);
  // before the tax SQL is run there's no TIN column: save the rest
  let note = "";
  if (error && /tax_id/.test(error.message || "")) {
    const { tax_id, ...rest } = row;
    ({ error } = await write(rest));
    if (!error && tax_id) note = " The TIN wasn't saved: run the latest tax SQL (RUN_NEW_2026-10-26d.sql) in Supabase first.";
  }
  if (error) return { error: "Could not save the customer." };
  revalidatePath("/app/customers");
  if (id) revalidatePath(`/app/customers/${id}`);
  return { message: (id ? "Customer updated." : "Customer added.") + note };
}

export async function archiveCustomer(id, archived = true) {
  const ctx = await requireBusiness();
  await ctx.supabase.from("customers").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).eq("business_id", ctx.business.id);
  revalidatePath("/app/customers");
  return { message: archived ? "Customer archived. Their documents are kept." : "Customer restored." };
}
