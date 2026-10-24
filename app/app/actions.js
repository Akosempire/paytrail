"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";

export async function switchBusiness(form) {
  const ctx = await getContext();
  if (!ctx.user) redirect("/login");
  const id = String(form.get("business_id") || "");
  // the profile policy only accepts a business you are a member of
  await ctx.supabase.from("profiles").upsert({ user_id: ctx.user.id, active_business_id: id });
  revalidatePath("/app", "layout");
  redirect("/app");
}
