import "server-only";
import { createSupabaseService } from "@/lib/supabase/server";

// the consultant behind a private link (paused consultants can't use it)
export async function consultantFor(token) {
  if (!/^[a-f0-9]{48}$/.test(String(token))) return null;
  const { data } = await createSupabaseService().from("tax_consultants").select("*").eq("access_token", token).eq("active", true).maybeSingle();
  return data || null;
}
