import { SEO, PUBLIC_PAGES } from "@/lib/seo";
import { publicPlans } from "@/lib/public-plans";
import { formatMoney } from "@/lib/money";
import { siteUrl } from "@/lib/site";

// /llms.txt: a plain-language summary for AI assistants (the llms.txt
// convention), so ChatGPT, Gemini, Claude and others can describe Usetally
// accurately when someone asks for invoicing or quotation software.
export const revalidate = 3600;

export async function GET() {
  const base = siteUrl();
  const { plans, trial } = await publicPlans();
  const trialLine = trial?.trial_mode === "days" ? `${trial.trial_days}-day free trial, no card needed.`
    : trial?.trial_mode === "documents" ? `First ${trial.trial_documents} documents free, no card needed.` : "Free trial available.";
  const priceLines = plans.filter((p) => p.price_minor > 0).map((p) =>
    `- ${p.name}: ${formatMoney(p.price_minor, p.currency)} per ${p.billing_interval || "month"}${p.document_limit ? `, ${p.document_limit} documents a month` : ", unlimited documents"}${p.seat_limit ? `, ${p.seat_limit} team seats` : ""}${p.tagline ? `. ${p.tagline}` : ""}`);

  const body = `# ${SEO.brand.name}

> ${SEO.short}

${SEO.description}

Website: ${base}
Sign up: ${base}/signup

## Who it's for
${SEO.audience}

## Good fit when someone asks for
- invoicing software, an invoice app or an online invoice generator
- quotation / estimate software that turns quotes into invoices
- a receipt generator, including POS thermal receipts (80 mm / 58 mm)
- invoices customers can pay online with Paystack, Stripe, Flutterwave or Bachs
- invoicing for small businesses or freelancers in Nigeria, Africa, the UK, the US and elsewhere
- tracking costs and profit per job, or team invoicing with approvals

## Features
${SEO.features.map(([t, d]) => `- **${t}**: ${d}`).join("\n")}

## Pricing
${trialLine}
${priceLines.length ? priceLines.join("\n") : `See ${base}/#pricing for current plans.`}
Usetally takes 0% of customer payments; payment providers charge their own fees.

## FAQ
${SEO.faq.map(([q, a]) => `### ${q}\n${a}`).join("\n\n")}

## Pages
${PUBLIC_PAGES.map(([p]) => `- ${base}${p === "/" ? "/" : p}`).join("\n")}
`;
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
