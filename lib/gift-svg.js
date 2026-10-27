// The free-access gift: a box with confetti and sparkles. One drawing for the
// dashboard pop-up (animated) and the email (public/email/gift.png).
const CONFETTI = [
  [28, 40, "#f43f5e", 20], [52, 18, "#fbbf24", -30], [86, 30, "#22c55e", 45], [150, 20, "#5a9dff", 15], [184, 34, "#a78bfa", -20],
  [212, 58, "#fbbf24", 35], [20, 88, "#5a9dff", -40], [214, 104, "#f43f5e", 10], [38, 132, "#22c55e", 25], [204, 146, "#a78bfa", -15],
  [118, 10, "#f43f5e", 60], [64, 64, "#a78bfa", -10], [176, 70, "#22c55e", 50],
];
const SPARKS = [[44, 104, 7], [196, 84, 8], [120, 34, 6], [70, 156, 5], [174, 158, 6]];
const star = (x, y, r) => `M${x} ${y - r}Q${x} ${y} ${x + r} ${y}Q${x} ${y} ${x} ${y + r}Q${x} ${y} ${x - r} ${y}Q${x} ${y} ${x} ${y - r}Z`;

export function giftSvg({ animated = false, width, height } = {}) {
  const cls = (c, delay) => (animated ? ` class="${c}" style="animation-delay:${delay}ms"` : "");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 180"${width ? ` width="${width}"` : ""}${height ? ` height="${height}"` : ""} role="img" aria-label="A gift">
${CONFETTI.map(([x, y, c, r], i) => `<rect x="${x}" y="${y}" width="9" height="4.5" rx="1.5" fill="${c}" transform="rotate(${r} ${x + 4.5} ${y + 2.25})"${cls("gift-confetti", (i % 6) * 90)}/>`).join("")}
${SPARKS.map(([x, y, r], i) => `<path d="${star(x, y, r)}" fill="#fbbf24"${cls("gift-spark", i * 150)}/>`).join("")}
<ellipse cx="120" cy="160" rx="62" ry="7" fill="#151513" opacity=".08"/>
<g${animated ? ' class="gift-pop"' : ""}>
<rect x="72" y="86" width="96" height="70" rx="9" fill="#175cd3"/>
<rect x="72" y="86" width="96" height="14" fill="#0f4aa8" opacity=".45"/>
<rect x="64" y="68" width="112" height="24" rx="7" fill="#2f74ea"/>
<rect x="112" y="68" width="16" height="88" fill="#fbbf24"/>
<path d="M120 68 C104 46, 82 50, 90 62 C94 68, 108 68, 120 68Z" fill="#fbbf24"/>
<path d="M120 68 C136 46, 158 50, 150 62 C146 68, 132 68, 120 68Z" fill="#f59e0b"/>
<circle cx="120" cy="67" r="6" fill="#f59e0b"/>
<rect x="80" y="104" width="10" height="38" rx="5" fill="#ffffff" opacity=".18"/>
</g></svg>`;
}
