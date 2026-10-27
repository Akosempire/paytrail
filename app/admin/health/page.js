import Link from "next/link";
import { Activity, AlertTriangle, BellRing, CheckCircle2, CircleX, Clock, ScrollText } from "lucide-react";
import { createSupabaseService } from "@/lib/supabase/server";
import { platformConfig } from "@/lib/platform-config";
import { siteUrl } from "@/lib/site";
import { timeAgo, formatDate } from "@/lib/format";
import { labelOf } from "@/lib/monitor";
import { Badge, Callout, Card, CardHeader, EmptyState, PageHeader, cx } from "@/components/ui";
import { AlertSettings, RunChecksButton } from "./controls";

export const metadata = { title: "Health & logs" };
export const dynamic = "force-dynamic";

const TONE = { ok: "success", warn: "warn", down: "danger" };
const WORD = { ok: "Working", warn: "Warning", down: "Broken" };
const ICON = { ok: CheckCircle2, warn: AlertTriangle, down: CircleX };
const SHORT = { email: "Email", payments: "Payment", storage: "Upload", backup_failed: "Backup" };
const FILTERS = [["", "All"], ["email", "Email"], ["payments", "Payments"], ["storage", "Uploads"], ["check", "Checks"], ["backup", "Backups"]];

export default async function HealthPage({ searchParams }) {
  const sp = await searchParams;
  const service = createSupabaseService();
  const filter = FILTERS.some(([k]) => k === sp.kind) ? sp.kind : "";
  let eventsQ = service.from("monitor_events").select("id, kind, detail, created_at").order("created_at", { ascending: false }).limit(150);
  if (filter === "check") eventsQ = eventsQ.like("kind", "check:%"); else if (filter === "backup") eventsQ = eventsQ.in("kind", ["backup", "backup_failed"]); else if (filter) eventsQ = eventsQ.eq("kind", filter);
  const since = new Date(Date.now() - 86400_000).toISOString();
  const [{ data: state, error }, { data: events }, { data: day }, { data: settings }, cfg] = await Promise.all([
    service.from("monitor_state").select("*").order("check_key"),
    eventsQ,
    service.from("monitor_events").select("kind").gte("created_at", since).not("kind", "like", "check:%").neq("kind", "backup"),
    service.from("platform_settings").select("alert_webhook_hint").eq("id", true).maybeSingle(),
    platformConfig(),
  ]);
  const checks = (state || []).filter((s) => !s.check_key.startsWith("live:"));
  const live = (state || []).filter((s) => s.check_key.startsWith("live:"));
  const counts = (day || []).reduce((m, e) => ({ ...m, [e.kind]: (m[e.kind] || 0) + 1 }), {});
  const broken = checks.filter((c) => c.status === "down");
  const lastRun = checks.reduce((t, c) => (c.checked_at > t ? c.checked_at : t), "");
  const stale = lastRun && Date.now() - Date.parse(lastRun) > 30 * 60_000;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Health & logs" description="Usetally checks itself and tells you when something breaks, before your users do." actions={<RunChecksButton />} />
      {error && <Callout tone="warn" title="One step left">Run <strong>RUN_NEW_2026-10-26e.sql</strong> in Supabase → SQL Editor to turn on monitoring and logs.</Callout>}
      {!error && !checks.length && <Callout tone="info" title="No checks yet">Press <strong>Run checks now</strong>, then set up the 5-minute check below.</Callout>}
      {broken.length > 0 && <Callout tone="danger" title={`${broken.length} thing${broken.length === 1 ? "" : "s"} broken`}>{broken.map((b) => labelOf(b.check_key)).join(", ")}. Details below.</Callout>}
      {stale && <Callout tone="warn" title="Checks aren't running often">Last check {timeAgo(lastRun)}. Set up the 5-minute check below so problems are caught quickly.</Callout>}

      <Card>
        <CardHeader icon={Activity} title="Checks" description={lastRun ? `Last checked ${timeAgo(lastRun)}` : "Not checked yet"} />
        <ul className="divide-y divide-line">
          {checks.map((c) => {
            const Icon = ICON[c.status];
            return (
              <li key={c.check_key} className="flex items-start gap-3 px-5 py-3.5">
                <Icon className={cx("mt-0.5 size-5 shrink-0", { ok: "text-success", warn: "text-warn", down: "text-danger" }[c.status])} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-ink">{labelOf(c.check_key)}<Badge size="sm" tone={TONE[c.status]}>{WORD[c.status]}</Badge></p>
                  <p className="mt-0.5 text-[13px] text-ink-2">{c.detail}</p>
                </div>
                <span className="shrink-0 text-[12px] text-ink-3">since {timeAgo(c.changed_at)}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {["email", "payments", "storage"].map((k) => {
          const st = live.find((l) => l.check_key === `live:${k}`);
          const n = counts[k] || 0;
          return (
            <Link key={k} href={`/admin/health?kind=${k}#logs`} className="rounded-xl bg-surface p-4 ring-1 ring-line hover:ring-line-strong">
              <p className="text-[13px] text-ink-3">{SHORT[k]} failures, last 24 h</p>
              <p className={cx("mt-1 text-[24px] font-semibold tabular-nums", n ? "text-danger" : "text-ink")}>{n}</p>
              <p className="text-[12px] text-ink-3">{st?.alerted_at ? `Last alert ${timeAgo(st.alerted_at)}` : "No alerts"}</p>
            </Link>
          );
        })}
      </div>

      <AlertSettings webhook={settings?.alert_webhook_hint || ""} emails={cfg.alertEmails} monitorUrl={`${siteUrl()}/api/monitor`} cronReady={Boolean(process.env.CRON_SECRET)} />

      <Card id="logs">
        <CardHeader icon={ScrollText} title="Log" description="Failures real users hit, and every time a check changed." />
        <nav className="flex gap-2 overflow-x-auto border-b border-line px-5 py-3" aria-label="Filter">
          {FILTERS.map(([k, label]) => (
            <Link key={k} href={`/admin/health${k ? `?kind=${k}` : ""}#logs`} aria-current={filter === k ? "page" : undefined}
              className={cx("shrink-0 rounded-full px-3 py-1 text-[12.5px] font-medium ring-1 ring-inset", filter === k ? "bg-brand text-white ring-brand" : "text-ink-2 ring-line hover:text-ink")}>{label}</Link>
          ))}
        </nav>
        {events?.length ? (
          <ul className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 px-5 py-3">
                <span className="w-24 shrink-0 text-[12px] text-ink-3" title={formatDate(e.created_at, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}><Clock className="mr-1 inline size-3" />{timeAgo(e.created_at)}</span>
                <div className="min-w-0 flex-1">
                  <Badge size="sm" tone={e.kind === "backup" ? "success" : e.kind.startsWith("check:") ? (/^Working/.test(e.detail) ? "success" : "warn") : "danger"}>{e.kind === "backup" ? "Backup saved" : e.kind.startsWith("check:") ? labelOf(e.kind.slice(6)) : `${SHORT[e.kind] || e.kind} failure`}</Badge>
                  <p className="mt-1 break-words text-[13px] text-ink-2">{e.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact icon={BellRing} title="Nothing logged" description="Failures and check changes appear here." />}
      </Card>
    </div>
  );
}
