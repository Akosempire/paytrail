import { SignupForm } from "@/components/auth-forms";
import { googleEnabled } from "@/lib/auth-providers";
import { createSupabaseService, supabaseConfigured } from "@/lib/supabase/server";
export const metadata = { title: "Create account" };

async function trialText() {
  if (!supabaseConfigured() || !process.env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const { data } = await createSupabaseService().from("platform_settings").select("trial_mode, trial_documents, trial_days").maybeSingle();
  if (!data || data.trial_mode === "none") return null;
  return data.trial_mode === "documents"
    ? `Your first ${data.trial_documents} quote${data.trial_documents === 1 ? "" : "s"} or invoice${data.trial_documents === 1 ? "" : "s"} are free. No card needed.`
    : `Free for ${data.trial_days} days. No card needed.`;
}

export default async function Page({ searchParams }) {
  const { next, email } = await searchParams;
  const [trial, google] = await Promise.all([trialText(), googleEnabled()]);
  return <SignupForm next={next} email={email} trialText={trial} google={google} />;
}
