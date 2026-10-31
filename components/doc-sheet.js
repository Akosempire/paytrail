// The "Notebook" and "Case file" templates (app/doc-templates.css, .pt-t-notebook
// and .pt-t-casefile). Same content, two dressings: ruled notebook paper with a
// margin line and a highlighted total, or a colour band with the number and a
// rubber stamp. lib/pdf.js draws the same layout for the PDF.
export function SheetDoc({ m }) {
  const x = m.sheet;
  const casefile = m.template === "casefile";
  const metaKey = (k, i) => (i === 0 ? "No." : k);
  const third = m.docTitle || m.delivery;
  // rubber stamp: Case file always shows the status; Notebook only when paid or void.
  // With nothing under "How to pay" (paid, receipts) it sits in that empty space.
  const word = casefile ? x.stamp : m.stamp;
  const stampInline = Boolean(word) && !(x.bank || x.due || x.instructions || x.payLink || m.receipt);
  return (
    <>
      {casefile ? (
        <div className="pt-cf-band">
          <span className="pt-cf-tag">{x.band}</span>
          <span className="pt-cf-no">{m.number}</span>
        </div>
      ) : (
        <div className="pt-nb-holes" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
      )}
      <div className="pt-page pt-sh-page">
        <header className="pt-sh-head">
          <div className="pt-sh-brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {m.business.logo && <img src={m.business.logo} alt="" className="pt-sh-logo" />}
            <div className="pt-sh-bwrap">
              <p className="pt-sh-bname">{m.business.name}</p>
              {x.tagline && <p className="pt-sh-mono pt-sh-tagline">{x.tagline}</p>}
            </div>
          </div>
          <div className="pt-titleblock pt-sh-titleblock">
            <p className="pt-sh-title">{m.title}</p>
            <dl className="pt-meta pt-sh-meta">
              {m.meta.map(([k, v], i) => <div key={k}><dt className="pt-sh-mono">{metaKey(k, i)}</dt><dd>{v}</dd></div>)}
            </dl>
          </div>
        </header>

        <section className={`pt-parties pt-sh-parties ${third ? "pt-sh-three" : ""}`}>
          <div>
            <p className="pt-sh-label">{m.receipt ? "Received from" : m.kind === "quote" ? "Prepared for" : "Billed to"}</p>
            <p className="pt-pname">{m.customer.name}</p>
            {m.customer.lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
          <div>
            <p className="pt-sh-label">From</p>
            <p className="pt-pname">{x.fromName}</p>
            {x.fromName !== m.business.name && <p>{m.business.name}</p>}
            {m.business.lines.map((l, i) => <p key={i}>{l}</p>)}
          </div>
          {third && (
            <div>
              {m.docTitle && <><p className="pt-sh-label">Project</p><p className="pt-pname">{m.docTitle}</p></>}
              {m.delivery && (
                <div className={m.docTitle ? "pt-sh-gap" : ""}>
                  <p className="pt-sh-label">Deliver to</p>
                  {m.delivery.address && <p className="pt-strong">{m.delivery.address}</p>}
                  {m.delivery.postcode && <p>{m.delivery.postcode}{m.delivery.area ? ` · ${m.delivery.area}` : ""}</p>}
                  {m.delivery.contact && <p>{m.delivery.contact}</p>}
                </div>
              )}
            </div>
          )}
        </section>

        {m.items.length > 0 && (
          <table className="pt-items pt-sh-items">
            <thead><tr><th>Description</th><th className="pt-num">Qty</th><th className="pt-num">Rate</th><th className="pt-num">Amount</th></tr></thead>
            <tbody>
              {m.items.map((i, idx) => (
                <tr key={idx}>
                  <td><p className="pt-item-desc">{i.description}</p>{i.details && <p className="pt-item-details">{i.details}</p>}</td>
                  <td className="pt-num">{i.quantity}</td>
                  <td className="pt-num">{i.unit}</td>
                  <td className="pt-num">{i.amount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {m.items.length === 0 && !m.receipt && <p className="pt-empty">No items yet.</p>}

        {m.receipt && (
          <dl className="pt-sh-rows">
            {m.receipt.rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        )}

        <section className="pt-sh-bottom">
          <div className="pt-sh-pay">
            {stampInline && <div className={`pt-sh-stamp pt-sh-stamp-inline pt-sh-stamp-${x.stampTone}`} aria-hidden="true">{word}</div>}
            {(x.bank || x.due || x.instructions || x.payLink) && <p className="pt-sh-label">How to pay</p>}
            {x.bank && (
              <>
                {x.bank.bank && <p><b>Bank</b> {x.bank.bank}</p>}
                <p><b>Account name</b> {x.bank.name}</p>
                <p><b>Account no.</b> <span className="pt-sh-acct">{x.bank.number}</span></p>
              </>
            )}
            {x.instructions && <p className="pt-pre">{x.instructions}</p>}
            {x.payLink && <p className="pt-link">Pay online: {x.payLink}</p>}
            {x.due && <p className="pt-sh-due">{x.due}</p>}
            {m.receipt && <p className="pt-sh-due">{m.receipt.fullyPaid ? "Paid in full. Thank you for your business." : "Part payment received. Thank you."}</p>}
          </div>
          <dl className="pt-totals pt-sh-totals">
            {!m.receipt && m.totals.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
            {m.paid && <><div><dt>Paid</dt><dd>{m.paid.paid}</dd></div></>}
            <div className="pt-sh-grand">
              <dt className="pt-sh-mono">{m.receipt ? "Amount received" : m.paid ? "Balance due" : m.total.label}</dt>
              <dd><span className="pt-sh-amount">{m.receipt ? m.receipt.amount : m.paid ? m.paid.balance : m.total.value}</span></dd>
            </div>
          </dl>
        </section>

        {word && !stampInline && <div className={`pt-sh-stamp pt-sh-stamp-${x.stampTone}`} aria-hidden="true">{word}</div>}

        {(m.notes || m.terms || m.accepted) && (
          <section className="pt-sh-notes">
            {m.notes && <div><p className="pt-sh-label">Notes</p><p className="pt-pre">{m.notes}</p></div>}
            {m.terms && <div><p className="pt-sh-label">Terms</p><p className="pt-pre">{m.terms}</p></div>}
            {m.accepted && <p className="pt-accepted">{m.accepted}</p>}
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
            </div>
          </section>
        )}

        <div className="pt-sh-spacer" />
        <footer className="pt-sh-foot">
          <div className="pt-sh-mono pt-sh-ask">
            {m.business.footer && <p className="pt-pre">{m.business.footer}</p>}
            {x.contact && <p>Questions about this {m.title.toLowerCase()}? {x.contact}</p>}
          </div>
          <p className="pt-sh-thanks">Thank you!</p>
        </footer>
        {m.poweredBy && <p className="pt-made">Powered by Usetally · usetally.cc</p>}
      </div>
    </>
  );
}
