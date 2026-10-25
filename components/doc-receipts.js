// Two receipt layouts with their own structure (app/doc-templates.css,
// .lg-* and .bd-*). lib/pdf.js draws the same layouts. Used by DocView.

// readable text colours to sit on the brand colour, and the brand colour to
// use on the dark header (very dark brands switch to white there)
export function accentInks(hex) {
  const v = String(hex || "#111111").replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return { onAccent: lum > 0.32 ? "#16213e" : "#ffffff", accentOnDark: lum < 0.09 ? "#ffffff" : `#${v}` };
}

const split = (rows) => {
  const get = (k) => rows.find(([label]) => label === k)?.[1];
  return {
    method: get("Payment method"), reference: get("Reference"), paidOn: get("Paid on"), forDoc: get("For"),
    invoiceTotal: get("Invoice total"), balance: get("Balance remaining"),
  };
};
const thanks = (m) => (m.receipt.fullyPaid ? "Paid in full. Thank you for your business." : "Part payment received. Thank you.");
const metaValue = (m, key) => m.meta.find(([k]) => k === key)?.[1];

function Signature({ m }) {
  if (!m.signature) return null;
  return (
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
  );
}

function Brand({ m, onDark = false }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (m.business.logo) return <img src={m.business.logo} alt={m.business.name} className={onDark ? "bd-logo" : "lg-logo"} />;
  return <p className={onDark ? "bd-bname" : "lg-bname"}>{m.business.name}</p>;
}

export function LedgerReceipt({ m }) {
  const r = split(m.receipt.rows);
  const details = [["Payment method", r.method], ["Reference", r.reference], ["Paid on", r.paidOn], ["For", r.forDoc]].filter(([, v]) => v);
  return (
    <>
      <div className="lg-band" aria-hidden="true" />
      <div className="pt-page">
        <header className="lg-head">
          <h1 className="lg-title">{m.title}</h1>
          <div className="lg-brand"><Brand m={m} /></div>
        </header>
        <section className="lg-parties">
          <div><p className="lg-label">{m.customer.label}</p><p className="pt-pname">{m.customer.name}</p>{m.customer.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
          <div><p className="lg-label">From</p><p className="pt-pname">{m.business.name}</p>{m.business.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
        </section>
        <section className="lg-meta">
          {[["Receipt no.", m.number], ["Date", metaValue(m, "Date")], ["For", metaValue(m, "For")], ["Amount received", m.receipt.amount]].map(([k, v]) => (
            <div key={k}><p className="lg-meta-k">{k}</p><p className="lg-meta-v">{v}</p></div>
          ))}
        </section>
        <table className="lg-table">
          <thead><tr><th>Detail</th><th className="pt-num">Value</th></tr></thead>
          <tbody>{details.map(([k, v]) => <tr key={k}><td>{k}</td><td className="pt-num">{v}</td></tr>)}</tbody>
        </table>
        <section className="lg-bottom">
          <div className="lg-note"><p className="lg-label">Note</p><p>{thanks(m)}</p></div>
          <dl className="lg-totals">
            {r.invoiceTotal && <div><dt>Invoice total</dt><dd>{r.invoiceTotal}</dd></div>}
            {r.balance && <div><dt>Balance remaining</dt><dd>{r.balance}</dd></div>}
            <div className="lg-grand"><dt>Amount paid</dt><dd>{m.receipt.amount}</dd></div>
          </dl>
        </section>
        <Signature m={m} />
        <footer className="lg-foot">
          <div>{m.business.lines.slice(0, 3).map((l, i) => <p key={i}>{l}</p>)}</div>
          <p className="lg-foot-name">{m.business.name}</p>
        </footer>
        {m.business.footer && <p className="lg-note-foot">{m.business.footer}</p>}
      </div>
    </>
  );
}

export function BoldReceipt({ m }) {
  const r = split(m.receipt.rows);
  const address = m.business.lines.find((l) => /\d/.test(l) && !/@|\+?\d[\d\s-]{6,}$/.test(l)) || m.business.lines[0] || "";
  const contacts = m.business.lines.filter((l) => l !== address).slice(0, 3);
  return (
    <>
      <header className="bd-head">
        <div className="bd-brand"><span className="bd-logo-chip"><Brand m={m} onDark /></span>{m.business.logo && <p className="bd-name">{m.business.name}</p>}</div>
        <div className="bd-titleblock">
          <p className="bd-title">{m.title}</p>
          <dl className="bd-meta">{[["Receipt no.", m.number], ...m.meta.filter(([k]) => k !== "Receipt")].map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        </div>
      </header>
      <div className="bd-stripe"><span className="bd-stripe-fill">{address}</span><span className="bd-slash bd-slash-1" /><span className="bd-slash bd-slash-2" /></div>
      <div className="pt-page">
        <section className="bd-parties">
          <div><p className="bd-label">{m.customer.label}</p><p className="pt-pname">{m.customer.name}</p>{m.customer.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
          <div className="bd-pay">
            <p className="bd-label">Payment method</p>
            <dl>{[["Method", r.method], ["Reference", r.reference], ["Paid on", r.paidOn]].filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          </div>
        </section>
        <table className="bd-table">
          <thead><tr><th>For</th><th className="pt-num">Invoice total</th><th className="pt-num">Paid</th><th className="pt-num">Balance</th></tr></thead>
          <tbody><tr><td>{r.forDoc}</td><td className="pt-num">{r.invoiceTotal}</td><td className="pt-num">{m.receipt.amount}</td><td className="pt-num">{r.balance}</td></tr></tbody>
        </table>
        <section className="bd-bottom">
          <div className="bd-thanks">
            <p className="bd-label">{m.receipt.fullyPaid ? "Thank you for your business" : "Part payment received"}</p>
            <ul>{contacts.map((l, i) => <li key={i}><span aria-hidden="true" />{l}</li>)}</ul>
          </div>
          <div className="bd-total"><span>Total paid</span><strong>{m.receipt.amount}</strong></div>
        </section>
        <Signature m={m} />
        {m.business.footer && <p className="bd-foot-note">{m.business.footer}</p>}
      </div>
      <div className="bd-foot-stripe" aria-hidden="true"><span /><span /><span /></div>
    </>
  );
}
