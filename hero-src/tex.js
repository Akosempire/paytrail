// Renders the paper faces used as textures in the Blender scene.
const { chromium } = require("playwright");
const path = require("path");
const OUT = path.join(__dirname, "tex");
require("fs").mkdirSync(OUT, { recursive: true });

const INK = "#161614", MUTED = "#6b6a63", LINE = "#e6e2d8", BLUE = "#175cd3", BLUE_SOFT = "#e6eefc", PAPER = "#fffdf8";

const base = `
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{background:${PAPER}}
  body{font-family:Inter,sans-serif;color:${INK};-webkit-font-smoothing:antialiased;font-feature-settings:"cv11" 1}
  table,.totals,.amt{font-feature-settings:"tnum" 1}
`;

const items = [
  ["Brand identity system", "Logo, colour, type, guidelines", "450,000"],
  ["Website design & build", "8 pages, CMS, launch support", "650,000"],
  ["Product photography", "Half-day studio session", "120,000"],
];

function doc({ kind, number, status, statusTone, footer }) {
  const pill = statusTone === "blue"
    ? `background:${BLUE_SOFT};color:${BLUE}`
    : statusTone === "amber" ? `background:#f6eedc;color:#8a5a12` : `background:#efece4;color:${MUTED}`;
  const dot = statusTone === "blue" ? BLUE : statusTone === "amber" ? "#c58a1c" : "#a3a196";
  return `<!doctype html><html><head><style>${base}
    .page{width:1400px;height:1980px;padding:120px 120px 100px;display:flex;flex-direction:column}
    .top{display:flex;justify-content:space-between;align-items:flex-start}
    .brand{display:flex;align-items:center;gap:22px}
    .mark{width:76px;height:76px;border-radius:20px;background:${INK};color:${PAPER};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:40px;letter-spacing:-1px}
    .bname{font-size:38px;font-weight:600;letter-spacing:-0.5px}
    .bsub{font-size:24px;color:${MUTED};margin-top:4px}
    .kind{text-align:right}
    .kind h1{font-size:30px;letter-spacing:6px;font-weight:600;color:${MUTED}}
    .kind .no{font-size:52px;font-weight:600;letter-spacing:-1px;margin-top:10px}
    .pill{display:inline-flex;align-items:center;gap:16px;margin-top:26px;padding:16px 30px;border-radius:999px;font-size:30px;font-weight:600;${pill}}
    .pill i{width:16px;height:16px;border-radius:50%;background:${dot};display:block}
    .meta{display:flex;gap:120px;margin-top:110px;font-size:25px}
    .meta b{display:block;font-size:22px;letter-spacing:3px;color:${MUTED};font-weight:600;margin-bottom:14px}
    .meta p{line-height:1.5}
    table{width:100%;border-collapse:collapse;margin-top:90px;font-size:28px}
    th{font-size:21px;letter-spacing:3px;color:${MUTED};font-weight:600;text-align:left;padding-bottom:22px;border-bottom:2px solid ${INK}}
    td{padding:30px 0;border-bottom:2px solid ${LINE};vertical-align:top}
    td small{display:block;font-size:22px;color:${MUTED};margin-top:8px}
    .r{text-align:right}
    .totals{margin-left:auto;width:560px;margin-top:40px;font-size:27px}
    .totals div{display:flex;justify-content:space-between;padding:12px 0;color:${MUTED}}
    .totals .grand{color:${INK};font-weight:700;font-size:44px;border-top:2px solid ${INK};margin-top:16px;padding-top:28px;letter-spacing:-1px}
    .notes{margin-top:90px;width:640px;font-size:24px;line-height:1.55;color:${MUTED}}
    .notes b{display:block;font-size:21px;letter-spacing:3px;font-weight:600;margin-bottom:12px}
    .foot{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;font-size:22px;color:${MUTED}}
    .sig{display:flex;flex-direction:column;gap:6px}
    .sig svg{display:block}
    .sig .line{width:420px;border-top:2px solid ${LINE};padding-top:12px}
  </style></head><body><div class="page">
    <div class="top">
      <div class="brand"><div class="mark">A</div><div><div class="bname">Adeyemi Studio</div><div class="bsub">Design &amp; brand studio</div></div></div>
      <div class="kind"><h1>${kind}</h1><div class="no">${number}</div><div class="pill"><i></i>${status}</div></div>
    </div>
    <div class="meta">
      <div><b>BILLED TO</b><p>Obi Foods Ltd<br>Chioma Obi<br>12 Marina Road</p></div>
      <div><b>${kind === "QUOTATION" ? "VALID UNTIL" : "DUE DATE"}</b><p>${kind === "QUOTATION" ? "7 November 2026" : "31 October 2026"}</p></div>
      <div><b>ISSUED</b><p>24 October 2026</p></div>
    </div>
    <table><thead><tr><th>DESCRIPTION</th><th class="r">AMOUNT (₦)</th></tr></thead><tbody>
      ${items.map(([a, b, c]) => `<tr><td>${a}<small>${b}</small></td><td class="r">${c}</td></tr>`).join("")}
    </tbody></table>
    <div class="totals">
      <div><span>Subtotal</span><span>₦1,220,000</span></div>
      <div><span>VAT 7.5%</span><span>₦91,500</span></div>
      <div class="grand"><span>Total</span><span>₦1,311,500</span></div>
    </div>
    <div class="notes"><b>NOTES</b><p>${kind === "QUOTATION" ? "50% deposit to begin, balance on delivery. Timeline: 4 weeks from acceptance." : "Thank you for your business. Payment confirms the schedule agreed in QT-0042."}</p></div>
    <div class="foot">${footer}</div>
  </div></body></html>`;
}

const signature = `<svg width="300" height="90" viewBox="0 0 300 90"><path d="M10 66 C 18 30, 40 10, 52 22 C 62 34, 40 70, 30 76 C 52 52, 70 40, 78 58 C 84 70, 96 44, 108 46 C 118 48, 112 66, 124 62 C 140 56, 146 36, 160 40 C 172 44, 160 64, 176 60 C 196 54, 214 40, 230 44 C 246 48, 236 62, 252 58 C 266 54, 278 46, 292 40" fill="none" stroke="${INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const pages = {
  quote_pending: doc({ kind: "QUOTATION", number: "QT-0042", status: "Awaiting response", statusTone: "grey",
    footer: `<div class="sig"><div style="height:90px"></div><div class="line">Customer acceptance</div></div><div>Thank you for the opportunity.</div>` }),
  quote_accepted: doc({ kind: "QUOTATION", number: "QT-0042", status: "Accepted", statusTone: "blue",
    footer: `<div class="sig">${signature}<div class="line">Accepted by Chioma Obi · 24 Oct</div></div><div>Thank you for the opportunity.</div>` }),
  invoice_due: doc({ kind: "INVOICE", number: "INV-0042", status: "Due 31 Oct", statusTone: "amber",
    footer: `<div>Pay online by card or bank transfer.</div><div>From quotation QT-0042</div>` }),
  invoice_paid: doc({ kind: "INVOICE", number: "INV-0042", status: "Paid", statusTone: "blue",
    footer: `<div>Paid in full · Receipt RC-0042</div><div>From quotation QT-0042</div>` }),
  card: `<!doctype html><html><head><style>${base}
    html,body{background:#ffffff}
    .c{width:1200px;height:700px;padding:80px 90px;display:flex;flex-direction:column}
    .row{display:flex;align-items:center;gap:30px}
    .tick{width:92px;height:92px;border-radius:50%;background:${BLUE};display:flex;align-items:center;justify-content:center}
    .t1{font-size:40px;font-weight:600;letter-spacing:-0.5px}
    .t2{font-size:26px;color:${MUTED};margin-top:6px}
    .amt{font-size:112px;font-weight:600;letter-spacing:-4px;margin-top:70px}
    .bot{margin-top:auto;display:flex;justify-content:space-between;font-size:26px;color:${MUTED};border-top:2px solid ${LINE};padding-top:30px}
    .bot b{color:${INK};font-weight:600}
  </style></head><body><div class="c">
    <div class="row"><div class="tick"><svg width="50" height="50" viewBox="0 0 24 24"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
    <div><div class="t1">Payment received</div><div class="t2">INV-0042 · Obi Foods Ltd</div></div></div>
    <div class="amt">₦1,311,500</div>
    <div class="bot"><span>via <b>Paystack</b></span><span>Receipt <b>RC-0042</b></span><span>24 Oct, 14:32</span></div>
  </div></body></html>`,
};

(async () => {
  const b = await chromium.launch();
  for (const [name, html] of Object.entries(pages)) {
    const card = name === "card";
    const p = await b.newPage({ viewport: card ? { width: 1200, height: 700 } : { width: 1400, height: 1980 }, deviceScaleFactor: 1 });
    await p.setContent(html);
    await p.waitForTimeout(150);
    await p.screenshot({ path: `${OUT}/${name}.png` });
    await p.close();
  }
  await b.close();
  console.log("ok");
})();
