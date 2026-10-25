// Renders a document model (lib/doc-model.js) as HTML sized in real paper
// units. Used by the live preview and the print pages; the PDF renderer
// (lib/pdf.js) follows the same template rules. Works on server and client.

export function DocView({ model: m, screen = true }) {
  const thermal = m.paperSpec.thermal;
  const cls = ["pt-doc", `pt-t-${m.template}`, `pt-p-${m.paper}`, thermal ? "pt-thermal" : "pt-sheet", screen ? "pt-screen" : ""].join(" ");
  return (
    <article className={cls} style={{ "--pt-accent": m.accent, "--pt-w": `${m.paperSpec.w}mm`, "--pt-h": m.paperSpec.h ? `${m.paperSpec.h}mm` : "auto", "--pt-m": `${m.paperSpec.margin}mm` }}
      aria-label={`${m.title} ${m.number}`}>
      <div className="pt-page">
        {m.stamp && thermal && <div className={`pt-stamp ${m.stamp === "VOID" ? "pt-stamp-void" : ""}`} aria-hidden="true">{m.stamp}</div>}
        <header className="pt-head">
          <div className="pt-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {m.business.logo ? <img src={m.business.logo} alt={m.business.name} className="pt-logo" /> : <p className="pt-bname">{m.business.name}</p>}
            {m.business.logo && m.template === "executive" && <p className="pt-bname pt-bname-sub">{m.business.name}</p>}
          </div>
          <div className="pt-titleblock">
            <p className="pt-kind">{m.title}</p>
            <dl className="pt-meta">
              {m.meta.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            </dl>
          </div>
        </header>

        <section className="pt-parties">
          {m.stamp && !thermal && <div className={`pt-stamp ${m.stamp === "VOID" ? "pt-stamp-void" : ""}`} aria-hidden="true">{m.stamp}</div>}
          <div>
            <p className="pt-label">From</p>
            <p className="pt-pname">{m.business.name}</p>
            {m.business.lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
          <div>
            <p className="pt-label">{m.customer.label}</p>
            <p className="pt-pname">{m.customer.name}</p>
            {m.customer.lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
        </section>

        {m.docTitle && m.kind !== "receipt" && <h2 className="pt-doctitle">{m.docTitle}</h2>}

        {m.receipt && (
          <section className="pt-received">
            <p className="pt-label">Amount received</p>
            <p className="pt-received-amount">{m.receipt.amount}</p>
          </section>
        )}

        {m.items.length > 0 && (thermal ? (
          <ul className="pt-lines">
            {m.items.map((i, idx) => (
              <li key={idx}>
                <p className="pt-line-desc">{i.description}</p>
                {i.details && <p className="pt-line-details">{i.details}</p>}
                <p className="pt-line-calc"><span>{i.quantity} × {i.unit}</span><span>{i.amount}</span></p>
              </li>
            ))}
          </ul>
        ) : (
          <table className="pt-items">
            <thead><tr><th>Description</th><th className="pt-num">Qty</th><th className="pt-num">Unit price</th><th className="pt-num">Amount</th></tr></thead>
            <tbody>
              {m.items.map((i, idx) => (
                <tr key={idx}>
                  <td><p className="pt-item-desc">{i.description}</p>{i.details && <p className="pt-item-details">{i.details}</p>}</td>
                  <td className="pt-num">{i.quantity}</td>
                  <td className="pt-num">{i.unit}</td>
                  <td className="pt-num pt-strong">{i.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        {m.items.length === 0 && m.kind !== "receipt" && <p className="pt-empty">No items yet.</p>}

        {m.showTotals && <section className="pt-totals">
          <dl>
            {m.totals.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            <div className="pt-grand"><dt>{m.total.label}</dt><dd>{m.total.value}</dd></div>
            {m.paid && <><div><dt>Paid</dt><dd>{m.paid.paid}</dd></div><div className="pt-balance"><dt>Balance</dt><dd>{m.paid.balance}</dd></div></>}
          </dl>
        </section>}

        {m.receipt && (
          <section className="pt-receipt-rows">
            <dl>{m.receipt.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
            <p className="pt-thanks">{m.receipt.fullyPaid ? "Paid in full. Thank you for your business." : "Part payment received. Thank you."}</p>
          </section>
        )}

        {(m.payBlocks.length > 0 || m.notes || m.terms || m.accepted) && (
          <section className="pt-blocks">
            {m.payBlocks.map((b) => (
              <div key={b.title} className="pt-block">
                <p className="pt-label">{b.title}</p>
                {b.bank && <><p className="pt-strong">{b.bank.name}</p><p className="pt-bank-no">{b.bank.number}</p><p>{b.bank.account}</p></>}
                {b.link ? <p className="pt-link">{b.text}</p> : <p className="pt-pre">{b.text}</p>}
              </div>
            ))}
            {m.notes && <div className="pt-block"><p className="pt-label">Notes</p><p className="pt-pre">{m.notes}</p></div>}
            {m.terms && <div className="pt-block pt-wide"><p className="pt-label">Terms</p><p className="pt-pre">{m.terms}</p></div>}
            {m.accepted && <div className="pt-block pt-wide pt-accepted"><p>{m.accepted}</p></div>}
          </section>
        )}

        {m.signature && (
          <section className="pt-sign">
            <div className="pt-sign-box">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {m.signature.image ? <img src={m.signature.image} alt={`Signature of ${m.signature.name || m.business.name}`} className="pt-sign-img" /> : <div className="pt-sign-space" />}
              <div className="pt-sign-line" />
              {m.signature.name && <p className="pt-strong">{m.signature.name}</p>}
              {m.signature.title && <p className="pt-sign-title">{m.signature.title}</p>}
              <p className="pt-label">Authorised signature</p>
            </div>
          </section>
        )}

        {(m.business.footer || thermal) && <footer className="pt-foot">{m.business.footer || "Thank you"}</footer>}
      </div>
    </article>
  );
}
