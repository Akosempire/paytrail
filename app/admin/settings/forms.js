"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Bell, Building, Save } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui-client";
import { saveAlerts, saveAnalytics, saveCompanyLegal } from "../actions";

function useSave(action, title) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return [pending, (form) => start(async () => {
    const r = await action(form);
    if (r.error) return toast.error({ title: "Not saved", message: r.error }, { duration: 12000 });
    toast.success({ title, message: r.message });
    router.refresh();
  })];
}

export function AnalyticsSettings({ saved }) {
  const [form, setForm] = useState({ sabilyticsSite: saved.analytics_sabilytics_site || "", sabilyticsDomain: saved.analytics_sabilytics_domain || "usetally.cc", gaId: saved.analytics_ga_id || "" });
  const [pending, save] = useSave(saveAnalytics, "Analytics saved");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const on = Boolean(saved.analytics_sabilytics_site || saved.analytics_ga_id);
  return (
    <Card>
      <CardHeader icon={BarChart3} title="Website analytics" description="Loaded on the live site only. Changes apply within 5 minutes, no redeploy."
        actions={on ? <Badge tone="success" size="sm">On</Badge> : <Badge tone="neutral" size="sm">Off</Badge>} />
      <div className="flex flex-col gap-5 p-5">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] font-semibold text-ink">Sabilytics</p>
          <p className="-mt-2 text-[13px] text-ink-3">From the snippet Sabilytics gives you: <code className="font-mono text-ink-2">data-site</code> and <code className="font-mono text-ink-2">data-domain</code>.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Site ID" htmlFor="sb-site" optional><Input id="sb-site" value={form.sabilyticsSite} onChange={set("sabilyticsSite")} placeholder="9h09ynxhgfc3" autoComplete="off" spellCheck={false} /></Field>
            <Field label="Domain" htmlFor="sb-domain"><Input id="sb-domain" value={form.sabilyticsDomain} onChange={set("sabilyticsDomain")} placeholder="usetally.cc" autoComplete="off" spellCheck={false} /></Field>
          </div>
        </div>
        <div className="flex flex-col gap-3 border-t border-line pt-5">
          <p className="text-[13px] font-semibold text-ink">Google Analytics</p>
          <Field label="Measurement ID" htmlFor="ga" optional hint="Admin → Data streams in Google Analytics. Leave empty to not use it."><Input id="ga" value={form.gaId} onChange={set("gaId")} placeholder="G-XXXXXXXXXX" autoComplete="off" spellCheck={false} className="sm:max-w-xs" /></Field>
        </div>
        <Button variant="primary" icon={Save} loading={pending} className="self-start" onClick={() => save(form)}>Save analytics</Button>
      </div>
    </Card>
  );
}

export function CompanyLegalSettings({ saved }) {
  const [form, setForm] = useState({ company: saved.legal_company || "", address: saved.legal_address || "", email: saved.legal_email || "", law: saved.legal_law || "", courts: saved.legal_courts || "", region: saved.legal_data_region || "" });
  const [pending, save] = useSave(saveCompanyLegal, "Company details saved");
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <Card>
      <CardHeader icon={Building} title="Company & legal" description="Who runs Usetally. Shown on the Terms, Privacy, DPA and Sub-processors pages." />
      <div className="grid gap-4 p-5 sm:grid-cols-2">
        <Field label="Company name" htmlFor="lc"><Input id="lc" value={form.company} onChange={set("company")} placeholder="Usetally Technologies Ltd" /></Field>
        <Field label="Contact email for legal & privacy" htmlFor="le" optional hint="Empty: the support email is used."><Input id="le" type="email" value={form.email} onChange={set("email")} placeholder="privacy@usetally.cc" /></Field>
        <Field label="Registered address" htmlFor="la" optional className="sm:col-span-2"><Textarea id="la" rows={2} value={form.address} onChange={set("address")} placeholder="12 Admiralty Way, Lekki, Lagos, Nigeria" /></Field>
        <Field label="Governing law" htmlFor="ll" optional><Input id="ll" value={form.law} onChange={set("law")} placeholder="the Federal Republic of Nigeria" /></Field>
        <Field label="Courts" htmlFor="lco" optional><Input id="lco" value={form.courts} onChange={set("courts")} placeholder="the courts of Lagos State" /></Field>
        <Field label="Where customer data is stored" htmlFor="lr" optional hint="Your Supabase project's region."><Input id="lr" value={form.region} onChange={set("region")} placeholder="European Union" /></Field>
        <div className="flex items-end sm:col-span-2"><Button variant="primary" icon={Save} loading={pending} onClick={() => save(form)}>Save company details</Button></div>
      </div>
    </Card>
  );
}

export function AlertSettings({ saved }) {
  const [emails, setEmails] = useState(saved.alert_emails || "");
  const [pending, save] = useSave(saveAlerts, "Alerts saved");
  return (
    <Card>
      <CardHeader icon={Bell} title="Admin alerts" description="Who's emailed when keys or settings change, or a payment needs a look." />
      <div className="flex flex-col gap-4 p-5">
        <Field label="Send alerts to" htmlFor="ae" optional hint="Separate addresses with commas. Empty: every platform admin.">
          <Input id="ae" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="you@usetally.cc, cofounder@usetally.cc" />
        </Field>
        <Button variant="primary" icon={Save} loading={pending} className="self-start" onClick={() => save({ emails })}>Save alerts</Button>
      </div>
    </Card>
  );
}
