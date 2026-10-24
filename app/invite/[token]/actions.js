"use server";
import { redirect } from "next/navigation";
import { getContext } from "@/lib/context";

export async function acceptInvite(_prev, form) {
  const ctx = await getContext();
  if (!ctx.user) redirect("/login");
  const { error } = await ctx.supabase.rpc("accept_invitation", { raw_token: String(form.get("token")), my_name: String(form.get("name") || "").trim().slice(0, 120) });
  if (error) return { error: error.message };
  redirect("/app?joined=1");
}
