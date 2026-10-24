import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/format";

// The customer-facing document, in the business's own branding. Used on the
// team's document page and on the customer's link. Never receives hidden costs.
export function DocumentSheet({ doc, items, business, logo, compact }) {
  const quote = doc.kind === "quote";
  const money = (v) => formatMoney(v, doc.currency, { decimals: 2 });
  const balance = doc.total_minor - doc.amount_paid_minor;
  const from = [business.legal_name && business.legal_name !== business.name ? business.legal_name : null, business.address, [business.city, business.country].filter(Boolean).join(", "), business.phone, business.email, business.tax_id && `TIN ${business.tax_id}`].filter(Boolean);
  const to = [doc.customer_company, doc.customer_address, doc.customer_phone, doc.customer_email].filter(Boolean);
  return (
    <article className="print-plain relative overflow-hidden rounded-xl bg-white text-[#101828] shadow-[var(--shadow-card)] ring-1 ring-[#eaecf0]" style={{ "--doc-brand": business.brand_color }}>
      <div className="h-1.5 doc-brand-bg" />
      {doc.status === "paid" && (
        <div className="pointer-events-none absolute top-24 right-6 rotate-[-10deg] rounded-md border-[3px] border-[#079455] px-3 py-1 text-xl font-bold tracking-[0.15em] text-[#079455] opacity-80 sm:right-12">PAID</div>
      )}
      <div className={compact ? "p-5 sm:p-7" : "p-6 sm:p-10"}>
        <header className="flex flex-wrap items-start justify-between gap-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt={business.name} className="h-12 max-w-[200px] object-contain object-left" /> : <p className="text-xl font-bold tracking-[-0.01em]">{business.name}</p>}
          <div className="text-right">
            <p className="text-[22px] font-bold tracking-[0.06em] doc-brand-text">{quote ? "QUOTATION" : "INVOICE"}</p>
            <p className="font-mono text-[13px] font-medium text-[#475467]">{doc.number}</p>
            <dl className="mt-2 space-y-0.5 text-[12.5px] text-[#475467]">
              <div><dt className="inline">Issued </dt><dd className="inline font-medium text-[#101828]">{formatDate(doc.issue_date)}</dd></div>
              {quote && doc.valid_until && <div><dt className="inline">Valid until </dt><dd className="inline font-medium text-[#101828]">{formatDate(doc.valid_until)}</dd></div>}
              {!quote && doc.due_date && <div><dt className="inline">Due </dt><dd className="inline font-medium text-[#101828]">{formatDate(doc.due_date)}</dd></div>}
            </dl>
          </div>
        </header>

        <div className="mt-8 grid gap-4 rounded-xl bg-[#f8f9fb] p-5 sm:grid-cols-2">
          <div>
            <p className="text-[10.5px] font-semibold tracking-[0.08em] text-[#98a2b3]">FROM</p>
            <p className="mt-1 font-semibold">{business.name}</p>
            {from.map((l) => <p key={l} className="text-[13px] text-[#475467]">{l}</p>)}
          </div>
          <div>
            <p className="text-[10.5px] font-semibold tracking-[0.08em] text-[#98a2b3]">{quote ? "PREPARED FOR" : "BILL TO"}</p>
            <p className="mt-1 font-semibold">{doc.customer_name || "—"}</p>
            {to.map((l) => <p key={l} className="text-[13px] break-words text-[#475467]">{l}</p>)}
          </div>
        </div>

        {doc.title && <h2 className="mt-8 text-lg font-semibold">{doc.title}</h2>}

        <ul className="mt-6 divide-y divide-[#eaecf0] border-y border-[#eaecf0] sm:hidden">
          {items.map((i, idx) => (
            <li key={i.id || idx} className="py-3 text-[13.5px]">
              <div className="flex justify-between gap-3"><p className="font-medium">{i.description}</p><p className="shrink-0 font-semibold tabular">{money(Math.round(Number(i.quantity) * Number(i.unit_price_minor)))}</p></div>
              {i.details && <p className="mt-0.5 text-[12.5px] whitespace-pre-line text-[#475467]">{i.details}</p>}
              <p className="mt-0.5 text-[12.5px] text-[#98a2b3] tabular">{Number(i.quantity)} × {money(i.unit_price_minor)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6 hidden sm:block">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="text-left text-white doc-brand-bg">
                <th className="rounded-l-lg px-3 py-2.5 font-semibold">Description</th>
                <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                <th className="px-3 py-2.5 text-right font-semibold">Unit price</th>
                <th className="rounded-r-lg px-3 py-2.5 text-right font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i, idx) => (
                <tr key={i.id || idx} className="border-b border-[#eaecf0] align-top">
                  <td className="px-3 py-3">
                    <p className="font-medium">{i.description}</p>
                    {i.details && <p className="mt-0.5 text-[12.5px] whitespace-pre-line text-[#475467]">{i.details}</p>}
                  </td>
                  <td className="px-3 py-3 text-right tabular">{Number(i.quantity)}</td>
                  <td className="px-3 py-3 text-right tabular">{money(i.unit_price_minor)}</td>
                  <td className="px-3 py-3 text-right font-medium tabular">{money(Math.round(Number(i.quantity) * Number(i.unit_price_minor)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex justify-end">
          <dl className="w-full max-w-xs space-y-2 text-[13.5px]">
            <div className="flex justify-between"><dt className="text-[#475467]">Subtotal</dt><dd className="tabular">{money(doc.subtotal_minor)}</dd></div>
            {Number(doc.discount_minor) > 0 && <div className="flex justify-between"><dt className="text-[#475467]">Discount</dt><dd className="tabular">−{money(doc.discount_minor)}</dd></div>}
            {Number(doc.tax_rate) > 0 && <div className="flex justify-between"><dt className="text-[#475467]">{doc.tax_label || "Tax"} ({Number(doc.tax_rate)}%)</dt><dd className="tabular">{money(doc.tax_minor)}</dd></div>}
            <div className="flex items-center justify-between rounded-lg px-4 py-3 text-white doc-brand-bg">
              <dt className="font-semibold">{quote ? "Total" : "Total due"}</dt><dd className="text-lg font-bold tabular">{money(doc.total_minor)}</dd>
            </div>
            {!quote && Number(doc.amount_paid_minor) > 0 && (
              <>
                <div className="flex justify-between pt-1"><dt className="text-[#475467]">Paid</dt><dd className="tabular">−{money(doc.amount_paid_minor)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Balance</dt><dd className="tabular">{money(balance)}</dd></div>
              </>
            )}
          </dl>
        </div>

        {(doc.notes || doc.terms || (business.bank_account_number && doc.status !== "paid")) && (
          <div className="mt-10 grid gap-6 border-t border-[#eaecf0] pt-6 text-[13px] sm:grid-cols-2">
            {business.bank_account_number && doc.status !== "paid" && (
              <div>
                <p className="text-[10.5px] font-semibold tracking-[0.08em] text-[#98a2b3]">BANK TRANSFER</p>
                <p className="mt-1.5 font-medium">{business.bank_name}</p>
                <p className="font-mono text-[15px] font-semibold tracking-wide">{business.bank_account_number}</p>
                <p className="text-[#475467]">{business.bank_account_name || business.name}</p>
                <p className="mt-1 text-[12px] text-[#98a2b3]">Use {doc.number} as your reference.</p>
              </div>
            )}
            {doc.notes && <div><p className="text-[10.5px] font-semibold tracking-[0.08em] text-[#98a2b3]">NOTES</p><p className="mt-1.5 whitespace-pre-line text-[#475467]">{doc.notes}</p></div>}
            {doc.terms && <div className="sm:col-span-2"><p className="text-[10.5px] font-semibold tracking-[0.08em] text-[#98a2b3]">TERMS</p><p className="mt-1.5 whitespace-pre-line text-[#475467]">{doc.terms}</p></div>}
          </div>
        )}
        {quote && doc.accepted_at && <p className="mt-6 rounded-lg bg-[#ecfdf3] px-4 py-3 text-[13px] text-[#067647]">Accepted by <strong>{doc.accepted_name || doc.customer_name}</strong> on {formatDate(doc.accepted_at)}.</p>}
        {business.footer_note && <p className="mt-8 border-t border-[#eaecf0] pt-4 text-center text-[12px] text-[#98a2b3]">{business.footer_note}</p>}
      </div>
    </article>
  );
}
