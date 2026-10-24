import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireBusiness } from "@/lib/context";
import { getDocument } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { emailConfigured } from "@/lib/email";
import { Callout, PageHeader } from "@/components/ui";
import { DocumentEditor } from "@/components/document-editor";

// shared by "new quote", "new invoice" and "edit draft"
export async function EditorPage({ kind, id, customerId }) {
  const ctx = await requireBusiness();
  let full = null;
  if (id) {
    full = await getDocument(ctx, id);
    if (!full) notFound();
    if (!["draft", "pending_approval"].includes(full.doc.status)) redirect(`/app/documents/${id}`);
    kind = full.doc.kind;
  }
  const showCosts = can(ctx.member, "costs.view");
  const [{ data: customers }, { data: presets }] = await Promise.all([
    ctx.supabase.from("customers").select("id, name, company, email, phone, address").eq("business_id", ctx.business.id).is("archived_at", null).order("name"),
    showCosts ? ctx.supabase.from("cost_presets").select("*").eq("business_id", ctx.business.id).order("label") : Promise.resolve({ data: [] }),
  ]);
  const b = ctx.business;
  const quote = kind === "quote";
  const blocked = ctx.allowance && !ctx.allowance.allowed;
  return (
    <div className="flex flex-col gap-6">
      <Link href={id ? `/app/documents/${id}` : quote ? "/app/quotes" : "/app/invoices"} className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-ink-2 hover:text-ink">
        <ArrowLeft className="size-4" />{id ? "Back to document" : quote ? "Quotes" : "Invoices"}
      </Link>
      <PageHeader title={id ? `Edit ${full.doc.number}` : quote ? "New quotation" : "New invoice"}
        description={quote ? (showCosts ? "Price the job, add your hidden costs to check your profit, then send it." : "Price the job, then send it.") : "Bill your customer directly, without a quote first."} />
      {blocked && <Callout tone="warn" title="You can save drafts, but not send yet">{ctx.allowance.reason === "deletion_pending" ? "This business is scheduled for deletion. Cancel it in Settings → Privacy & data to send again." : <>Your free trial or plan limit has been reached. {can(ctx.member, "settings.billing") ? <Link className="font-semibold underline" href="/app/settings/billing">Choose a plan</Link> : "Ask the account owner to choose a plan."}</>}</Callout>}
      <DocumentEditor
        kind={kind}
        doc={full?.doc ? { ...full.doc, customer_id: full.doc.customer_id } : customerId ? { customer_id: customerId } : null}
        items={full?.items}
        costs={full?.costs}
        customers={customers || []}
        presets={presets || []}
        business={{ currency: b.currency, tax_rate: Number(b.tax_rate), tax_label: b.tax_label, default_terms: b.default_terms, quote_validity_days: b.quote_validity_days, invoice_due_days: b.invoice_due_days, require_approval: b.require_approval,
          name: b.name, legal_name: b.legal_name, email: b.email, phone: b.phone, website: b.website, address: b.address, city: b.city, country: b.country, tax_id: b.tax_id,
          logo_path: b.logo_path, brand_color: b.brand_color, footer_note: b.footer_note, bank_name: b.bank_name, bank_account_name: b.bank_account_name, bank_account_number: b.bank_account_number, document_prefs: b.document_prefs }}
        perms={{ canViewCosts: showCosts, isJunior: ctx.member.role === "junior_finance" }}
        emailReady={emailConfigured()}
      />
    </div>
  );
}
