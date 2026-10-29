import Link from "next/link";
import { Clock, Timer, Users } from "lucide-react";
import { requirePlatformAdmin } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { Button, Callout, Card, CardHeader, EmptyState, PageHeader, StatCard, StatGroup, cx } from "@/components/ui";
import { duration, summarizeUsage } from "@/lib/usage-core";

export const metadata = { title: "Usage" };
export const dynamic = "force-dynamic";

const PERIODS = { "7": "7 days", "30": "30 days", "90": "90 days" };
const lagosDay = (offset) => new Date(Date.now() + 3600_000 - offset * 86400_000).toISOString().slice(0, 10);

export default async function Page({ searchParams }) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const period = PERIODS[sp.days] ? sp.days : "30";
  const businessId = typeof sp.business === "string" && /^[0-9a-f-]{36}$/i.test(sp.business) ? sp.business : null;
  const service = createSupabaseService();
  let q = service.from("usage_daily").select("user_id, business_id, day, area, seconds").gte("day", lagosDay(Number(period) - 1)).limit(50000);
  if (businessId) q = q.eq("business_id", businessId);
  const { data: rows, error } = await q;
  if (error && /usage_daily/.test(error.message || "")) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Usage" description="How long people spend in Usetally, and where." />
        <Callout tone="warn" title="One step left">Run <strong>RUN_NEW_2026-10-29b.sql</strong> in Supabase (SQL Editor). Time starts counting from then.</Callout>
      </div>
    );
  }
  const ids = [...new Set((rows || []).map((r) => r.business_id))];
  const { data: biz } = ids.length ? await service.from("businesses").select("id, name").in("id", ids) : { data: [] };
  const names = Object.fromEntries((biz || []).map((b) => [b.id, b.name]));
  const s = summarizeUsage(rows, { businesses: names });
  let people = [];
  if (businessId) {
    const { data: members } = await service.from("memberships").select("user_id, full_name, email").eq("business_id", businessId);
    const per = new Map();
    for (const r of rows || []) { const p = per.get(r.user_id) || { seconds: 0, days: new Set(), last: r.day }; p.seconds += r.seconds; p.days.add(r.day); if (r.day > p.last) p.last = r.day; per.set(r.user_id, p); }
    people = [...per].map(([id, p]) => { const m = (members || []).find((x) => x.user_id === id); return { id, name: m?.full_name || m?.email || "Former member", seconds: p.seconds, days: p.days.size, last: p.last }; }).sort((a, b) => b.seconds - a.seconds);
  }
  const maxDay = Math.max(1, ...s.days.map((d) => d.seconds));
  const qs = (o) => `/admin/usage?${new URLSearchParams({ days: period, ...(businessId ? { business: businessId } : {}), ...o })}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={businessId ? `Usage · ${names[businessId] || "Business"}` : "Usage"}
        description="Active time in the app: counted only while the tab is open and someone is using it (idle over 2 minutes stops the clock). Your own use isn't counted."
        actions={<>
          {Object.entries(PERIODS).map(([k, v]) => <Button key={k} size="sm" variant={k === period ? "primary" : "secondary"} href={qs({ days: k })}>{v}</Button>)}
          {businessId && <Button size="sm" href={`/admin/usage?days=${period}`}>All businesses</Button>}
        </>} />
      <StatGroup cols={3}>
        <StatCard label="Total active time" value={duration(s.totalSeconds)} icon={Clock} tone="brand" />
        <StatCard label="Active people" value={s.people} icon={Users} />
        <StatCard label="Average per person per day" value={duration(s.avgPerPersonDay)} hint="On days they used it" icon={Timer} />
      </StatGroup>
      {!rows?.length ? (
        <Card><EmptyState icon={Clock} title="No time recorded yet" description="Time starts counting when people use the app after the update." /></Card>
      ) : (
        <>
          <Card>
            <CardHeader title="Each day" description="Bar = total active time; number = people active" />
            <div className="flex h-40 items-end gap-1 overflow-x-auto px-5 pb-2 pt-4" role="img" aria-label="Active time per day">
              {s.days.map((d) => (
                <div key={d.day} className="flex min-w-[14px] flex-1 flex-col items-center gap-1" title={`${formatDate(d.day)}: ${duration(d.seconds)}, ${d.people} people`}>
                  <span className="text-[10.5px] text-ink-3">{d.people}</span>
                  <div className="w-full rounded-t bg-brand/80" style={{ height: `${Math.max(4, (d.seconds / maxDay) * 110)}px` }} />
                </div>
              ))}
            </div>
            <div className="flex justify-between px-5 pb-4 text-[11.5px] text-ink-3"><span>{formatDate(s.days[0].day)}</span><span>{formatDate(s.days.at(-1).day)}</span></div>
          </Card>
          <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
            <Card>
              <CardHeader title="Where time goes" />
              <ul className="flex flex-col gap-3 px-5 py-4">
                {s.areas.slice(0, 12).map((a) => (
                  <li key={a.name} className="flex flex-col gap-1">
                    <div className="flex justify-between text-sm"><span className="text-ink">{a.name}</span><span className="tabular-nums text-ink-2">{duration(a.seconds)} · {Math.round(a.share * 100)}%</span></div>
                    <div className="h-1.5 rounded-full bg-tray"><div className="h-1.5 rounded-full bg-brand" style={{ width: `${Math.max(2, a.share * 100)}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Card>
            {businessId ? (
              <Card>
                <CardHeader title="People" />
                <Table head={["Person", "Time", "Days", "Last seen"]} rows={people.map((p) => [p.name, duration(p.seconds), p.days, formatDate(p.last)])} />
              </Card>
            ) : (
              <Card>
                <CardHeader title="Businesses" description="Most time first. Open one to see its people." />
                <Table head={["Business", "Time", "People", "Last seen"]}
                  rows={s.businesses.slice(0, 50).map((b) => [<Link key={b.id} className="text-brand-ink underline" href={qs({ business: b.id })}>{b.name}</Link>, duration(b.seconds), b.people, formatDate(b.last)])} />
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-[12px] text-ink-3">{head.map((h, i) => <th key={h} className={cx("px-5 py-2 font-medium", i && "text-right")}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cx("px-5 py-2.5", j ? "text-right tabular-nums text-ink-2" : "text-ink")}>{c}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}
