import "server-only";
import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";

// Who operates PayTrail. Set these in your hosting environment variables.
export async function legalDetails() {
  let email = process.env.LEGAL_EMAIL || "";
  if (!email && supabaseConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const { data } = await createSupabaseService().from("platform_settings").select("support_email").eq("id", true).maybeSingle();
    email = data?.support_email || "";
  }
  return {
    company: process.env.LEGAL_COMPANY_NAME || "PayTrail",
    address: process.env.LEGAL_ADDRESS || "Lagos, Nigeria",
    email: email || "support@paytrail.app",
    updated: "24 October 2026",
  };
}
