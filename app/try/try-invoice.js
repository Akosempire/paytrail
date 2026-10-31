"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Building2, Check, Lock } from "lucide-react";
import { Button, Card, CardHeader, Field, Input, PageHeader, Select } from "@/components/ui";
import { Modal } from "@/components/ui-client";
import { DocumentEditor } from "@/components/document-editor";
import { CURRENCIES } from "@/lib/money";
import { GUEST_KEY, cleanGuestBusiness, packGuestDraft } from "@/lib/guest-draft";

const BIZ_KEY = "usetally:try:business";
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };

// "Try it": the real invoice builder with no account. Everything stays in this
// browser; Send asks them to create an account, and the draft follows them in
// (components/guest-draft-import.js picks it up inside the app).
export function TryInvoice() {
  const [biz, setBiz] = useState({ name: "", email: "", phone: "", address: "", currency: "NGN" });
  const [ready, setReady] = useState(false);
  const [gate, setGate] = useState(false);

  useEffect(() => {
    const saved = read(BIZ_KEY);
    if (saved) setBiz(cleanGuestBusiness(saved, CURRENCIES));
    setReady(true);
  }, []);
  useEffect(() => { if (ready) write(BIZ_KEY, JSON.stringify(biz)); }, [biz, ready]);
  const set = (k) => (e) => setBiz((b) => ({ ...b, [k]: e.target.value }));

  // what the builder and the live preview need to know about "your business"
  const business = useMemo(() => ({
    currency: biz.currency, tax_rate: 0, tax_label: "VAT", tax2_rate: 0, tax2_label: "", default_terms: "",
    quote_validity_days: 14, invoice_due_days: 14, require_approval: false,
    name: biz.name.trim() || "Your business", legal_name: "", email: biz.email, phone: biz.phone, website: "", address: biz.address, city: "", country: "", tax_id: "",
    logo_path: null, signature_path: null, signatory_name: "", signatory_title: "", brand_color: null, footer_note: "",
    bank_name: "", bank_account_name: "", bank_account_number: "", document_prefs: null,
  }), [biz]);

  // the builder's "save": keep it here, then ask them to sign up to send
  const onSave = async (input) => {
    if (!write(GUEST_KEY, packGuestDraft({ input, business: biz, currencies: CURRENCIES }))) {
      return { error: "Your browser is blocking storage, so we can't keep this invoice for you. Create a free account to save it." };
    }
    return { id: "try" };
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="No account needed" title="Make your first invoice"
        description="Fill it in and watch it take shape. It stays in this browser until you create a free account to send it, and nothing needs retyping." />

      <Card>
        <CardHeader title="Your business" icon={Building2} description="Shown at the top of the invoice." />
        <div className="grid items-start gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Business name" htmlFor="try-name"><Input id="try-name" value={biz.name} onChange={set("name")} autoComplete="organization" placeholder="Tolu Adeyemi Designs" className="h-12 text-[16px] sm:h-10 sm:text-sm" /></Field>
          <Field label="Phone / WhatsApp" htmlFor="try-phone" optional><Input id="try-phone" type="tel" inputMode="tel" value={biz.phone} onChange={set("phone")} autoComplete="tel" placeholder="+234 801 234 5678" className="h-12 text-[16px] sm:h-10 sm:text-sm" /></Field>
          <Field label="Email" htmlFor="try-email" optional><Input id="try-email" type="email" inputMode="email" autoCapitalize="none" value={biz.email} onChange={set("email")} autoComplete="email" placeholder="hello@yourbusiness.com" className="h-12 text-[16px] sm:h-10 sm:text-sm" /></Field>
          <Field label="Currency" htmlFor="try-currency"><Select id="try-currency" value={biz.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Address" htmlFor="try-address" optional className="sm:col-span-2 lg:col-span-4"><Input id="try-address" value={biz.address} onChange={set("address")} autoComplete="street-address" placeholder="12 Admiralty Way, Lekki Phase 1" /></Field>
        </div>
      </Card>

      {ready && (
        <DocumentEditor guest kind="invoice" doc={null} customers={[]} presets={[]} business={business}
          perms={{ canViewCosts: false, isJunior: false }} emailReady={false}
          onSave={onSave} onSaved={() => setGate(true)} />
      )}

      <Modal open={gate} onClose={() => setGate(false)} size="sm" title="Your invoice is ready to send"
        description="Create a free account to send it. It comes with you, so nothing needs retyping."
        footer={<>
          <Button href="/login" variant="secondary">I have an account</Button>
          <Button href="/signup" variant="primary" iconRight={ArrowRight}>Create free account</Button>
        </>}>
        <ul className="flex flex-col gap-2.5 text-[14px] text-ink-2">
          {["Email it, share a link on WhatsApp, or download a PDF", "Customers pay by transfer or card, straight into your own account", "Automatic reminders and receipts when they pay"].map((t) => (
            <li key={t} className="flex gap-2.5"><Check className="mt-0.5 size-4 shrink-0 text-success-ink" aria-hidden />{t}</li>
          ))}
        </ul>
        <p className="mt-4 flex gap-2 text-[12.5px] text-ink-3"><Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />Kept in this browser only. We don't store your invoice until you sign up.</p>
      </Modal>
    </div>
  );
}
