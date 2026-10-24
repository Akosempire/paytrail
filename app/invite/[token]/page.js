import Link from "next/link";
import { createSupabaseService } from "@/lib/supabase/server";
import { getContext } from "@/lib/context";
import { sha256 } from "@/lib/crypto";
import { ROLES } from "@/lib/permissions";
import { AuthLayout } from "@/components/auth-layout";
import { Button, Callout } from "@/components/ui";
import { AcceptInvite } from "./accept";

export const metadata = { title: "Join a team" };

export default async function InvitePage({ params }) {
  const { token } = await params;
  const service = createSupabaseService();
  const { data: inv } = await service.from("invitations").select("email, role, expires_at, accepted_at, revoked_at, businesses(name)").eq("token_hash", sha256(token)).maybeSingle();
  const ctx = await getContext();
  const valid = inv && !inv.revoked_at && !inv.accepted_at && new Date(inv.expires_at) > new Date();
  const next = encodeURIComponent(`/invite/${token}`);
  return (
    <AuthLayout>
      {!valid ? (
        <div className="flex flex-col gap-4">
          <h1 className="text-title-1 text-ink">This invitation can't be used</h1>
          <p className="text-sm text-ink-2">{inv?.accepted_at ? "It has already been accepted." : "It may have expired or been cancelled. Ask whoever invited you to send a new one."}</p>
          <Button href={ctx.user ? "/app" : "/login"} variant="primary">{ctx.user ? "Go to PayTrail" : "Sign in"}</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <div>
            <p className="text-overline text-brand-ink">Team invitation</p>
            <h1 className="mt-2 text-title-1 text-ink">Join {inv.businesses?.name} on PayTrail</h1>
            <p className="mt-1 text-sm text-ink-2">You've been invited as <strong className="text-ink">{ROLES[inv.role].label}</strong>. {ROLES[inv.role].summary}</p>
          </div>
          {ctx.user ? (
            ctx.user.email?.toLowerCase() === inv.email ? <AcceptInvite token={token} name={ctx.user.user_metadata?.full_name || ""} /> : (
              <Callout tone="warn" title="Different account">This invitation is for <strong>{inv.email}</strong>, but you're signed in as {ctx.user.email}. Sign out and sign in with the invited email.</Callout>
            )
          ) : (
            <div className="flex flex-col gap-2">
              <Button href={`/signup?next=${next}&email=${encodeURIComponent(inv.email)}`} variant="primary" size="lg">Create an account</Button>
              <Button href={`/login?next=${next}`} size="lg">I already have an account</Button>
              <p className="mt-1 text-center text-xs text-ink-3">Use <strong>{inv.email}</strong>. That's the address this invitation was sent to.</p>
            </div>
          )}
          <Link href="/" className="text-center text-[13px] text-ink-3 hover:text-ink">What is PayTrail?</Link>
        </div>
      )}
    </AuthLayout>
  );
}
