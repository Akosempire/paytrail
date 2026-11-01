import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck, TriangleAlert } from "lucide-react";
import { getContext } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { ACCESS, appFor, checkAuthorizeRequest, redirectWith } from "@/lib/ai/oauth-core";
import { getClient } from "@/lib/ai/oauth";
import { aiSite } from "@/lib/ai/http";
import { ROLES } from "@/lib/permissions";
import { ConsentForm } from "./consent-form";

export const metadata = { title: "Connect an AI assistant", robots: { index: false } };
const PARAMS = ["client_id", "redirect_uri", "response_type", "code_challenge", "code_challenge_method", "state", "scope", "resource"];

// "ChatGPT wants to use your Usetally": the person picks the business and what
// the assistant may do, then is sent back to the assistant.
export default async function Page({ searchParams }) {
  const sp = await searchParams;
  const params = Object.fromEntries(PARAMS.map((k) => [k, Array.isArray(sp[k]) ? sp[k][0] : sp[k] ?? ""]));
  const ctx = await getContext();
  if (!ctx.user) redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${new URLSearchParams(params)}`)}`);
  const client = await getClient(createSupabaseService(), params.client_id);
  const req = checkAuthorizeRequest(params, client, aiSite());
  if (req.fatal) return (
    <div className="flex flex-col items-center gap-3 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full bg-tray text-danger"><TriangleAlert className="size-6" aria-hidden="true" /></span>
      <h1 className="text-title-1 text-ink">This connection can't continue</h1>
      <p className="text-sm text-ink-2">{req.fatal}</p>
      <Link href="/app" className="text-sm font-medium text-brand-ink hover:underline">Go to Usetally</Link>
    </div>
  );
  if (req.error) redirect(redirectWith(req.redirect, { error: req.error, error_description: req.description, state: req.state, iss: aiSite() }));

  const app = appFor(req.redirect, client.name);
  const businesses = ctx.memberships.map((m) => ({ id: m.business_id, name: m.businesses?.name || "Your business", role: ROLES[m.role]?.label || m.role }));
  if (!businesses.length) return (
    <div className="flex flex-col gap-3 text-center">
      <h1 className="text-title-1 text-ink">Set up your business first</h1>
      <p className="text-sm text-ink-2">{app.name} connects to a business. Create yours, then connect again from {app.name}.</p>
      <Link href="/onboarding" className="text-sm font-medium text-brand-ink hover:underline">Set up my business</Link>
    </div>
  );
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand-ink"><ShieldCheck className="size-6" aria-hidden="true" /></span>
        <h1 className="text-title-1 text-ink">Connect {app.name} to Usetally</h1>
        <p className="text-sm text-ink-2">
          {app.local ? <>An app on this computer{app.name !== "An app on your computer" ? <> calling itself <strong className="text-ink">{app.name}</strong></> : null} wants to</> : <><strong className="text-ink">{app.name}</strong> wants to</>} work in your Usetally as you, {ctx.profile?.full_name || ctx.user.email}.
        </p>
        {!app.local && <p className="text-xs text-ink-3">You'll go back to <strong className="font-semibold text-ink-2">{app.host}</strong>{app.known ? "" : ". Only continue if you started this from that site."}</p>}
      </div>
      <ConsentForm params={params} businesses={businesses} defaultBusiness={ctx.business?.id || businesses[0].id}
        access={ACCESS} readOnly={req.scope === "read"} appName={app.name} />
    </div>
  );
}
