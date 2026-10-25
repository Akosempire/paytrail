// "Merchant" layout for quotes, invoices and receipts (app/doc-templates.css,
// .mc-*). lib/pdf.js draws the same layout. Used by DocView.

export function MerchantDoc({ m }) {
  const x = m.merchant;
  const addressLines = m.business.lines.filter((l) => !/^TIN /.test(l));
  const date = m.meta.find(([k]) => k === "Date" || k === "Issued")?.[1];
  return (
    <div className="pt-page mc">
      <header className="mc-head">
        <div className="mc-brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {m.business.logo && <img src={m.business.logo} alt="" className="mc-logo" />}
          <div className="mc-bid">
            <p className="mc-bname">{m.business.name}</p>
            {addressLines.slice(0, 2).map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </div>
        <div className="mc-contact">
          {addressLines.slice(2).map((l, i) => <p key={i}>{l}</p>)}
          {x.taxLine && <p className="mc-tax">{x.taxLine}</p>}
        </div>
      </header>

      <section className="mc-band">
        <p className="mc-band-title">{m.title}</p>
        <div className="mc-band-num">
          <p className="mc-number">{m.number}</p>
          {date && <p className="mc-date">{date}</p>}
        </div>
      </section>

      <section className="mc-bill">
        <div>
          <p className="mc-label">{m.customer.label}</p>
          <p className="mc-cname">{m.customer.name}</p>
          {m.customer.lines.map((l, i) => <p key={i}>{l}</p>)}
        </div>
        <dl className="mc-meta">
          {m.meta.filter(([k]) => !["Receipt", "Invoice", "Quotation", "Date", "Issued"].includes(k)).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
      </section>

      {m.docTitle && <p className="mc-subject">{m.docTitle}</p>}

      <table className="mc-table">
        <thead>
          <tr><th className="mc-sr"><span className="mc-sr-long">Sr no.</span><span className="mc-sr-short">#</span></th><th>Product</th><th className="pt-num mc-shade">Qty</th><th className="pt-num mc-shade">Rate</th><th className="pt-num mc-amt">Amount</th></tr>
        </thead>
        <tbody>
          {m.items.map((it, i) => (
            <tr key={i}>
              <td className="mc-sr">{i + 1}</td>
              <td><p className="mc-item">{it.description}</p>{it.details && <p className="mc-details">{it.details}</p>}</td>
              <td className="pt-num mc-shade">{it.quantity}</td>
              <td className="pt-num mc-shade">{it.unit}</td>
              <td className="pt-num mc-amt">{it.amount}</td>
            </tr>
          ))}
          <tr className="mc-total-row">
            <td /><td>Total</td><td className="pt-num mc-shade">{x.qty}</td><td className="pt-num mc-shade">-</td><td className="pt-num mc-amt">{x.itemsTotal}</td>
          </tr>
        </tbody>
      </table>

      <section className="mc-panel">
        <p className="mc-panel-head">Please note</p>
        <div className="mc-panel-grid">
        <div className="mc-notes">
          {x.terms.length > 0 ? <ol>{x.terms.map((t, i) => <li key={i}>{t}</li>)}</ol> : <p className="mc-muted">{m.receipt ? "Thank you for your business." : "Thank you for choosing us."}</p>}
          {x.notes && <p className="mc-note-text">{x.notes}</p>}
        </div>
        <dl className="mc-sums">
          {m.totals.length > 1 && m.totals.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          <div className="mc-grand"><dt>Grand total</dt><dd>{x.grand}</dd></div>
          {x.paid.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
        </dl>
        </div>
      </section>

      <section className="mc-words">
        {x.outstanding && <p><strong>{x.outstanding.label}:</strong> {x.outstanding.value}</p>}
        <p><strong>{x.wordsLabel}:</strong> {x.words}</p>
      </section>

      {(m.signature || m.stamp) && (
        <section className="mc-sign">
          {m.signature && (
            <div className="mc-sign-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.signature.image ? <img src={m.signature.image} alt={`Signature of ${m.signature.name || m.business.name}`} className="mc-sign-img" /> : <div className="mc-sign-space" />}
              {m.signature.name && <p className="mc-sign-name">{m.signature.name}</p>}
              {m.signature.title && <p className="mc-sign-title">{m.signature.title}</p>}
              <p className="mc-sign-label">Signature</p>
            </div>
          )}
          {m.stamp && <p className={`mc-stamp ${m.stamp === "VOID" ? "mc-stamp-void" : ""}`} aria-hidden="true">{m.stamp}</p>}
        </section>
      )}

      {x.bank && (
        <section className="mc-bank">
          <div><p className="mc-bank-k">Payable to</p><p>{x.bank.payee}</p></div>
          <div><p className="mc-bank-k">Banking details</p><p>{x.bank.bank || "—"}</p></div>
          <div><p className="mc-bank-k">Account number</p><p>{x.bank.number}</p></div>
        </section>
      )}

      {m.business.footer && <p className="mc-foot">{m.business.footer}</p>}
    </div>
  );
}
