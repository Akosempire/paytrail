import "server-only";
import { supabaseUrl } from "@/lib/supabase/url";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { createPreviewClient, previewEnabled } from "./preview";

export function supabaseConfigured() {
  if (previewEnabled()) return true;
  return Boolean(supabaseUrl() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// acts as the signed-in user, so row-level security applies to every query
export async function createSupabaseServer() {
  if (previewEnabled()) return createPreviewClient();
  const store = await cookies();
  return createServerClient(supabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); }
        catch { /* called from a server component; the proxy refreshes the session */ }
      },
    },
  });
}

// bypasses row-level security. Only for: customer document links, provider
// webhooks, reading encrypted payment keys, and platform jobs.
export function createSupabaseService() {
  if (previewEnabled()) return createPreviewClient();
  const url = supabaseUrl();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
