"use server";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { postcodeFields } from "@/lib/postcode-server";

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
  // Nigeria's postcode, checked with NIPOST (kept unverified if NIPOST can't be reached)
  if (form.postcode !== undefined) {
    const pc = await postcodeFields(form.postcode);
    if (pc.error) return { error: pc.error };
    Object.assign(row, pc.fields);
  }
  if (row.email && !/^\S+@\S+\.\S+$/.test(row.email)) return { error: "That email doesn't look right." };
  const write = (r) => id
    ? ctx.supabase.from("customers").update(r).eq("id", id).eq("business_id", ctx.business.id)
    : ctx.supabase.from("customers").insert({ ...r, business_id: ctx.business.id });
  let { error } = await write(row);
  // before the tax SQL is run there's no TIN column: save the rest
  let note = "";
  if (error && /postcode/.test(error.message || "")) {
    const { postcode, postcode_area, postcode_verified_at, ...rest } = row;
    ({ error } = await write(rest));
    if (!error && postcode) note = " The postcode wasn't saved: run RUN_NEW_2026-10-27c.sql in Supabase first.";
  }
  if (error && /tax_id/.test(error.message || "")) {
    const { tax_id, postcode, postcode_area, postcode_verified_at, ...rest } = row;
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
