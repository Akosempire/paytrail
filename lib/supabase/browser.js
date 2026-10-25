"use client";
import { createBrowserClient } from "@supabase/ssr";
import { supabaseUrl } from "@/lib/supabase/url";

let client;
export function supabaseBrowser() {
  client ??= createBrowserClient(supabaseUrl(), process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return client;
}
