"use client";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownUp, KeyRound, RefreshCw, Save, SlidersHorizontal } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, cx } from "@/components/ui";
import { Switch, useToast } from "@/components/ui-client";
import { moneyIn } from "@/lib/marketing-format";
import { saveMarketingSettings, saveMetaConnection, syncNow } from "./actions";

const VERDICT = { kill: ["❌ Kill", "danger"], scale: ["✅ Scale", "success"], watch: ["⚠️ Watch", "warn"] };

function useRun(action, title) {
  const router = useRouter(), toast = useToast();
  const [pending, start] = useTransition();
  return [pending, (arg) => start(async () => {
    const r = await action(arg);
    if (r?.error) return toast.error({ title: "Didn't work", message: r.error }, { duration: 12000 });
    toast.success({ title, message: r?.message });
    router.refresh();
  })];
}

export function Filters({ period, country, periods }) {
  const link = (p, c) => `/admin/marketing?period=${p}&country=${c}`;
  const pill = (on) => cx("inline-flex h-10 shrink-0 items-center rounded-lg px-3.5 text-[13px] font-medium", on ? "bg-surface text-ink shadow-[var(--shadow-xs)] ring-1 ring-line" : "text-ink-3 hover:text-ink");
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Period" className="flex gap-1 overflow-x-auto rounded-xl bg-tray p-1 [scrollbar-width:none]">
        {Object.entries(periods).map(([k, label]) => <Link key={k} href={link(k, country)} className={pill(k === period)} scroll={false}>{label.replace("Last ", "").replace(" hours", "h").replace(" days", " days")}</Link>)}
      </nav>
      <nav aria-label="Country" className="flex gap-1 rounded-xl bg-tray p-1">
        {[["all", "All"], ["NG", "NG"], ["UK", "UK"]].map(([k, label]) => <Link key={k} href={link(period, k)} className={pill(k === country)} scroll={false}>{label}</Link>)}
      </nav>
    </div>
  );
}

export function SyncNow() {
  const [pending, run] = useRun(syncNow, "Synced");
  return <Button variant="primary" icon={RefreshCw} loading={pending} onClick={() => run()} className="h-11">Sync now</Button>;
}

const COLS = [["name", "Ad"], ["country", "Country"], ["spend", "Spend"], ["link_clicks", "Clicks"], ["cpc", "Per click"], ["signups", "Sign-ups"], ["cost_per_signup", "Per sign-up"], ["paid", "Paid"], ["revenue", "Revenue"], ["verdict", "Verdict"]];
export function AdsTable({ rows, currency }) {
  const money = moneyIn(currency);
  const [sort, setSort] = useState(["spend", -1]);
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const [k, dir] = sort, x = a[k] ?? -Infinity, y = b[k] ?? -Infinity;
    return (typeof x === "string" ? String(x).localeCompare(String(y)) : x - y) * dir;
  }), [rows, sort]);
  const cell = (r, k) => ({ spend: money(r.spend), cpc: money(r.cpc), cost_per_signup: money(r.cost_per_signup), revenue: money(r.revenue), country: r.country || "—",
    verdict: <Badge tone={VERDICT[r.verdict][1]} size="sm">{VERDICT[r.verdict][0]}</Badge> }[k] ?? r[k]);
  return (
    <>
      {/* phones: one card per ad */}
      <ul className="flex flex-col gap-2.5 md:hidden">
        {sorted.map((r) => (
          <li key={r.ad_id} className="rounded-xl bg-surface p-4 ring-1 ring-line">
            <div className="flex items-start justify-between gap-3"><p className="min-w-0 font-semibold text-ink">{r.name}<span className="ml-1.5 text-[12px] font-normal text-ink-3">{r.country || ""}</span></p>{cell(r, "verdict")}</div>
            <dl className="mt-3 grid grid-cols-3 gap-y-2 text-[13px]">
              {[["Spend", money(r.spend)], ["Sign-ups", r.signups], ["Per sign-up", money(r.cost_per_signup)], ["Clicks", r.link_clicks], ["Paid", r.paid], ["Revenue", money(r.revenue)]].map(([l, v]) => (
                <div key={l}><dt className="text-[11px] text-ink-3">{l}</dt><dd className="font-semibold tabular-nums text-ink">{v}</dd></div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-[13.5px]">
          <thead><tr className="border-b border-line text-[12px] text-ink-3">
            {COLS.map(([k, label]) => (
              <th key={k} className={cx("px-3 py-2.5 font-medium whitespace-nowrap", k === "name" || k === "country" || k === "verdict" ? "text-left" : "text-right")}>
                <button type="button" onClick={() => setSort(([s, d]) => [k, s === k ? -d : -1])} className="inline-flex items-center gap-1 hover:text-ink">{label}{sort[0] === k && <ArrowDownUp className="size-3" />}</button>
              </th>
            ))}
          </tr></thead>
          <tbody>{sorted.map((r) => (
            <tr key={r.ad_id} className="border-b border-line last:border-0">
              {COLS.map(([k]) => <td key={k} className={cx("px-3 py-2.5 whitespace-nowrap", k === "name" ? "max-w-[240px] truncate font-medium text-ink" : k === "country" || k === "verdict" ? "" : "text-right tabular-nums")}>{cell(r, k)}</td>)}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

export function Funnel({ steps }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="flex flex-col gap-3">
      {steps.map((s) => (
        <li key={s.label}>
          <div className="flex items-baseline justify-between text-[13px]"><span className="font-medium text-ink">{s.label}</span>
            <span className="tabular-nums text-ink-2"><b className="text-ink">{s.value}</b>{s.lost != null && <span className="ml-2 text-[12px] text-ink-3">−{s.lost}%</span>}</span></div>
          <div className="mt-1.5 h-2.5 rounded-full bg-tray"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(2, (s.value / max) * 100)}%` }} /></div>
        </li>
      ))}
    </ol>
  );
}

// daily spend (bars) and sign-ups (line), last 14 days
export function TrendChart({ days, currency }) {
  const money = moneyIn(currency);
  const W = 640, H = 200, P = 28, bw = (W - P * 2) / days.length;
  const maxS = Math.max(1, ...days.map((d) => d.spend)), maxU = Math.max(1, ...days.map((d) => d.signups));
  const y = (v, m) => H - P - (v / m) * (H - P * 2);
  const line = days.map((d, i) => `${P + i * bw + bw / 2},${y(d.signups, maxU)}`).join(" ");
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily spend and sign-ups, last 14 days">
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="currentColor" className="text-line" />
        {days.map((d, i) => (
          <g key={d.date}>
            <rect x={P + i * bw + bw * 0.18} y={y(d.spend, maxS)} width={bw * 0.64} height={Math.max(0, H - P - y(d.spend, maxS))} rx="3" className="fill-brand/25"><title>{`${d.date}: ${money(d.spend)}`}</title></rect>
            {i % 2 === 0 && <text x={P + i * bw + bw / 2} y={H - 8} textAnchor="middle" className="fill-ink-3 text-[10px]">{d.date.slice(5)}</text>}
          </g>
        ))}
        <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2.5" className="text-brand" strokeLinejoin="round" />
        {days.map((d, i) => <circle key={d.date} cx={P + i * bw + bw / 2} cy={y(d.signups, maxU)} r="3.5" className="fill-brand"><title>{`${d.date}: ${d.signups} sign-ups`}</title></circle>)}
      </svg>
      <figcaption className="mt-1 flex gap-4 text-[12px] text-ink-3"><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-brand/25" />Spend (max {money(maxS)})</span><span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-brand" />Sign-ups (max {maxU})</span></figcaption>
    </figure>
  );
}

export function MetaConnection({ saved }) {
  const [form, setForm] = useState({ adAccountId: saved.meta_ad_account_id || "", pixelId: saved.meta_pixel_id || "", accessToken: "", capiToken: "" });
  const [pending, run] = useRun(saveMetaConnection, "Meta connection saved");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const ready = Boolean(saved.meta_access_token_hint && saved.meta_ad_account_id);
  return (
    <Card>
      <CardHeader icon={KeyRound} title="Meta connection" description="Pasted here, checked with Meta, stored encrypted. No redeploy." actions={<Badge tone={ready ? "success" : "warn"} size="sm">{ready ? "Connected" : "Not set up"}</Badge>} />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Ad account ID" htmlFor="m-acc" hint="Ads Manager, top left."><Input id="m-acc" inputMode="numeric" value={form.adAccountId} onChange={set("adAccountId")} placeholder="2167224513581774" /></Field>
        <Field label="Pixel ID" htmlFor="m-px" hint="Events Manager → Data sources."><Input id="m-px" inputMode="numeric" value={form.pixelId} onChange={set("pixelId")} placeholder="1234567890123456" /></Field>
        <Field label="Access token (ads_read)" htmlFor="m-tok" hint={saved.meta_access_token_hint ? `Saved: ${saved.meta_access_token_hint}. Leave empty to keep it.` : "A long-lived system user token from Business Settings."}>
          <Input id="m-tok" type="password" autoComplete="off" value={form.accessToken} onChange={set("accessToken")} placeholder={saved.meta_access_token_hint ? "••••••••" : "EAA…"} />
        </Field>
        <Field label="Conversions API token" htmlFor="m-capi" hint={saved.meta_capi_token_hint ? `Saved: ${saved.meta_capi_token_hint}. Leave empty to keep it.` : "Events Manager → your Pixel → Settings → Generate access token."}>
          <Input id="m-capi" type="password" autoComplete="off" value={form.capiToken} onChange={set("capiToken")} placeholder={saved.meta_capi_token_hint ? "••••••••" : "EAA…"} />
        </Field>
        <div className="sm:col-span-2"><Button variant="primary" icon={Save} loading={pending} className="h-11" onClick={() => run(form)}>Check and save</Button></div>
      </div>
    </Card>
  );
}

export function Thresholds({ saved, currency }) {
  const sym = currency === "USD" ? "$" : "₦";
  const [form, setForm] = useState({ kill: String(Number(saved.kill_spend_no_signup ?? 3000)), maxCps: String(Number(saved.max_cost_per_signup ?? 1500)), scaleMin: String(saved.scale_min_signups ?? 3), rate: String(Number(saved.ngn_per_usd ?? 1500)), reportEmail: saved.report_email || "", reportsEnabled: saved.reports_enabled !== false });
  const [pending, run] = useRun(saveMarketingSettings, "Saved");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Card>
      <CardHeader icon={SlidersHorizontal} title="Verdicts & report" description={`Amounts in your ad account's currency (${sym}).`} />
      <div className="flex flex-col gap-4 p-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label={`Kill after spending (${sym})`} htmlFor="t-kill" hint="…with no sign-ups."><Input id="t-kill" inputMode="decimal" value={form.kill} onChange={set("kill")} /></Field>
          <Field label={`Most per sign-up (${sym})`} htmlFor="t-cps" hint="Kill at 1.5× this."><Input id="t-cps" inputMode="decimal" value={form.maxCps} onChange={set("maxCps")} /></Field>
          <Field label="Scale after (sign-ups)" htmlFor="t-min" hint="…at or under the cost above."><Input id="t-min" inputMode="numeric" value={form.scaleMin} onChange={set("scaleMin")} /></Field>
          <Field label="₦ per $1" htmlFor="t-rate" hint="To compare ₦ spend with $ revenue."><Input id="t-rate" inputMode="decimal" value={form.rate} onChange={set("rate")} /></Field>
        </div>
        <Field label="Send reports to" htmlFor="t-mail"><Input id="t-mail" type="email" value={form.reportEmail} onChange={set("reportEmail")} placeholder="you@usetally.cc" /></Field>
        <Switch checked={form.reportsEnabled} onChange={(v) => setForm({ ...form, reportsEnabled: v })} label="Email a report every 6 hours" description="From reports@usetally.cc." />
        <Button variant="primary" icon={Save} loading={pending} className="h-11 self-start" onClick={() => run(form)}>Save</Button>
      </div>
    </Card>
  );
}
