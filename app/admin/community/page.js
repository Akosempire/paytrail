import { Download, MailCheck, MessageCircle, MousePointerClick, Users } from "lucide-react";
import { requireAdminSection } from "@/lib/context";
import { formatDate } from "@/lib/format";
import { siteUrl } from "@/lib/site";
import { communitySettings } from "@/lib/community-run";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, StatCard, StatGroup } from "@/components/ui";
import { CommunitySettings, ResendButton } from "./ui";

export const metadata = { title: "Community" };
export const dynamic = "force-dynamic";

// WhatsApp community sign-ups: the public form's settings, and who signed up and joined
export default async function CommunityAdmin({ searchParams }) {
  const ctx = await requireAdminSection("marketing");
  const { q = "" } = await searchParams;
  const term = String(q).trim().slice(0, 80);
  const cfg = await communitySettings();
  let query = ctx.supabase.from("community_signups").select("id, name, email, phone, batch, business_name, stage, created_at, emailed_at, reminders, clicked_at, stopped_at", { count: "exact" }).order("created_at", { ascending: false }).limit(200);
  if (term) query = query.or(`name.ilike.%${term.replace(/[%,()]/g, "")}%,email.ilike.%${term.replace(/[%,()]/g, "")}%,business_name.ilike.%${term.replace(/[%,()]/g, "")}%,phone.ilike.%${term.replace(/[%,()]/g, "")}%`);
  const [{ data: rows, count, error }, { count: joined }, { count: total }] = await Promise.all([
    query,
    ctx.supabase.from("community_signups").select("id", { count: "exact", head: true }).not("clicked_at", "is", null),
    ctx.supabase.from("community_signups").select("id", { count: "exact", head: true }),
  ]);
  const n = (v) => Number(v || 0).toLocaleString("en-NG");
  const status = (r) => r.clicked_at ? ["Opened link", "success"] : r.stopped_at ? ["Stopped reminders", "neutral"] : !r.emailed_at ? ["Email not sent", "danger"] : [`Waiting${r.reminders ? ` · ${r.reminders} reminder${r.reminders === 1 ? "" : "s"}` : ""}`, "warn"];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="WhatsApp community" description="The sign-up form at usetally.cc/community. People get the group link by email, with reminders after 1, 3 and 7 days until they open it." />
      {cfg.missingSql && <Callout tone="warn" title="Database update needed">Run supabase/RUN_NEW_2026-11-21a.sql in Supabase → SQL Editor, then reload.</Callout>}
      <StatGroup>
        <StatCard icon={Users} tone="brand" label="Signed up" value={n(total)} />
        <StatCard icon={MousePointerClick} tone="success" label="Opened the group link" value={n(joined)} hint={total ? `${Math.round((Number(joined || 0) / Number(total)) * 100)}% of sign-ups` : undefined} />
        <StatCard icon={MailCheck} tone="warn" label="Not opened yet" value={n(Number(total || 0) - Number(joined || 0))} hint="Reminded automatically" />
      </StatGroup>
      <CommunitySettings saved={{ enabled: cfg.enabled, link: cfg.link, batches: (cfg.batches || []).join("\n"), rules: cfg.rules }} formUrl={`${siteUrl()}/community`} />
      <Card>
        <CardHeader icon={MessageCircle} title="Sign-ups" description={term ? `${n(count)} matching “${term}”` : `Newest first${Number(count) > 200 ? " (latest 200)" : ""}`}
          actions={<a href="/admin/community/export" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-surface px-3 text-[13px] font-medium ring-1 ring-inset ring-line-strong hover:bg-hover"><Download className="size-4" aria-hidden="true" />Download CSV</a>} />
        <form className="flex gap-2 px-5 pb-4" role="search">
          <input name="q" defaultValue={term} placeholder="Search name, email, phone or business" aria-label="Search sign-ups" className="h-10 w-full rounded-md bg-surface px-3 text-sm ring-1 ring-inset ring-line-strong sm:w-96" />
          <button type="submit" className="h-10 shrink-0 rounded-md bg-surface px-4 text-sm font-medium ring-1 ring-inset ring-line-strong hover:bg-hover">Search</button>
        </form>
        {error ? <EmptyState icon={Users} title="Sign-ups couldn't load" description="Run the community SQL in Supabase if you haven't yet." /> : !rows?.length ? (
          <EmptyState icon={Users} title={term ? "No one matches" : "No sign-ups yet"} description={term ? "Try part of a name, email or phone." : "Share usetally.cc/community to start."} />
        ) : (
          <ul className="divide-y divide-line border-t border-line">
            {rows.map((r) => {
              const [label, tone] = status(r);
              return (
                <li key={r.id} className="grid gap-x-4 gap-y-1.5 px-5 py-3.5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,1fr)_230px] lg:items-center">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{r.name}</p><p className="truncate text-xs text-ink-3">{r.business_name} · {r.stage}</p></div>
                  <div className="min-w-0 text-[13px] text-ink-2"><p className="truncate">{r.email}</p><p className="truncate text-ink-3">{r.phone}</p></div>
                  <div className="text-[13px] text-ink-2"><p>{r.batch}</p><p className="text-xs text-ink-3">Signed up {formatDate(r.created_at)}</p></div>
                  <div className="flex items-center gap-2 lg:justify-end"><Badge size="sm" tone={tone}>{label}</Badge>{!r.clicked_at && <ResendButton id={r.id} />}</div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
