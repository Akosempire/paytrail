// "Scan or tap to pay": a QR code and a tappable link to the customer page,
// on every exported quote and invoice that's still open (lib/doc-model.js
// payNowParts). lib/pdf.js draws the same box, with a clickable link.
export function qrPath(rows) {
  let d = "";
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== "1") continue;
      let n = 1;
      while (row[c + n] === "1") n++;
      d += `M${c} ${r}h${n}v1h-${n}z`;
      c += n - 1;
    }
  });
  return d;
}

export function PayNow({ p, className = "" }) {
  const n = p.qr.length;
  return (
    <a href={p.link} target="_blank" rel="noopener noreferrer" className={`pt-paynow ${className}`}>
      {n > 0 && (
        <svg className="pt-paynow-qr" viewBox={`-2 -2 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" role="img" aria-label="QR code to pay online">
          <rect x="-2" y="-2" width={n + 4} height={n + 4} fill="#fff" />
          <path d={qrPath(p.qr)} fill="#111" />
        </svg>
      )}
      <span className="pt-paynow-text">
        <span className="pt-label">{p.label}</span>
        <span className="pt-paynow-amt">{p.amount}</span>
        <span className="pt-paynow-link">{p.short}</span>
      </span>
    </a>
  );
}
