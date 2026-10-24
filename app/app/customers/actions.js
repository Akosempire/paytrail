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
    updated_at: new Date().toISOString(),
  };
  if (!row.name) return { error: "Enter a name." };
  if (row.email && !/^\S+@\S+\.\S+$/.test(row.email)) return { error: "That email doesn't look right." };
  const q = id
    ? ctx.supabase.from("customers").update(row).eq("id", id).eq("business_id", ctx.business.id)
    : ctx.supabase.from("customers").insert({ ...row, business_id: ctx.business.id });
  const { error } = await q;
  if (error) return { error: "Could not save the customer." };
  revalidatePath("/app/customers");
  if (id) revalidatePath(`/app/customers/${id}`);
  return { message: id ? "Customer updated." : "Customer added." };
}

export async function archiveCustomer(id, archived = true) {
  const ctx = await requireBusiness();
  await ctx.supabase.from("customers").update({ archived_at: archived ? new Date().toISOString() : null }).eq("id", id).eq("business_id", ctx.business.id);
  revalidatePath("/app/customers");
  return { message: archived ? "Customer archived. Their documents are kept." : "Customer restored." };
}
