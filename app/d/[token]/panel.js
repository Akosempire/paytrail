"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Landmark, Loader2, ShieldCheck, ThumbsDown, ThumbsUp, Copy, Check } from "lucide-react";
import { respondToQuote, payDocument } from "./actions";
import { useToast } from "@/components/ui-client";

const NAMES = { stripe: "Stripe", paystack: "Paystack", bachs: "Bachs", flutterwave: "Flutterwave" };

// Light-only by design: this page is the business's branded document, not Usetally's app.
export function CustomerPanel({ token, doc, amount, paid, expired, providers, hasBank, bank, brandName, invoiceNumber }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState(null); // "accept" | "decline"
  const [name, setName] = useState(doc.customer_name || "");
  const [reason, setReason] = useState("");
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const quote = doc.kind === "quote";
  const awaitingReply = quote && ["sent", "viewed"].includes(doc.status) && !expired;
  const payable = !paid && !["void", "declined"].includes(doc.status) && (!quote || doc.status === "accepted");

  function respond(accept) {
    start(async () => {
      const r = await respondToQuote(token, { accept, name, reason });
      if (r.error) return toast.error(r.error);
      setMode(null);
      toast.success(accept ? { title: "Quote accepted", message: `Thank you. ${brandName} has been told.` } : { title: "Quote declined", message: `${brandName} has been told.` });
      router.refresh();
    });
  }
  function pay(provider) {
    start(async () => {
      const id = toast.loading(`Opening secure ${NAMES[provider] || ""} checkout…`);
      const r = await payDocument(token, provider);
      if (r.error) return toast.update(id, { intent: "error", message: r.error });
      window.location.href = r.url;
    });
  }

  const btn = "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold transition-opacity disabled:opacity-50";

  return (
    <div className="overflow-hidden rounded-xl bg-white ring-1 ring-[#eaecf0]">
      <div className="px-5 pt-5 pb-4">
        <p className="text-[11px] font-semibold tracking-[0.08em] text-[#98a2b3]">{paid ? "PAID" : quote && doc.status !== "accepted" ? "QUOTATION TOTAL" : "AMOUNT DUE"}</p>
        <p className="mt-1 text-[28px] leading-9 font-bold tracking-[-0.02em] tabular">{amount}</p>
        {paid && <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-[#067647]"><CheckCircle2 className="size-4" />Paid in full. Thank you!</p>}
        {quote && doc.status === "accepted" && !paid && <p className="mt-2 flex items-center gap-1.5 text-sm text-[#067647]"><CheckCircle2 className="size-4" />Accepted by {doc.accepted_name}{invoiceNumber ? ` · Invoice ${invoiceNumber}` : ""}</p>}
        {doc.status === "declined" && <p className="mt-2 text-sm text-[#b42318]">You declined this quote. Contact {brandName} if you've changed your mind.</p>}
        {expired && quote && doc.status !== "accepted" && <p className="mt-2 text-sm text-[#b54708]">This quote has expired. Ask {brandName} for an updated one.</p>}
      </div>


      {awaitingReply && !mode && (
        <div className="flex flex-col gap-2 border-t border-[#eaecf0] p-5">
          <button type="button" className={`${btn} text-white doc-brand-bg`} onClick={() => setMode("accept")}><ThumbsUp className="size-4" />Accept quote</button>
          <button type="button" className={`${btn} bg-white text-[#344054] ring-1 ring-[#d0d5dd] hover:bg-[#f8f9fb]`} onClick={() => setMode("decline")}><ThumbsDown className="size-4" />Decline</button>
        </div>
      )}
      {mode === "accept" && (
        <div className="flex flex-col gap-3 border-t border-[#eaecf0] p-5">
          <label className="text-[13px] font-medium text-[#475467]" htmlFor="sig">Type your full name to accept</label>
          <input id="sig" value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-lg px-3 text-[15px] ring-1 ring-[#d0d5dd] focus:outline-none focus:ring-2 focus:ring-[var(--doc-brand)]" />
          <p className="text-xs text-[#98a2b3]">By accepting, you agree to the items, price and terms in this quotation.</p>
          <button type="button" disabled={pending} className={`${btn} text-white doc-brand-bg`} onClick={() => respond(true)}>{pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}Accept & continue</button>
          <button type="button" className="text-sm font-medium text-[#475467]" onClick={() => setMode(null)}>Back</button>
        </div>
      )}
      {mode === "decline" && (
        <div className="flex flex-col gap-3 border-t border-[#eaecf0] p-5">
          <label className="text-[13px] font-medium text-[#475467]" htmlFor="why">Anything {brandName} should know? (optional)</label>
          <textarea id="why" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-lg px-3 py-2 text-sm ring-1 ring-[#d0d5dd] focus:outline-none focus:ring-2 focus:ring-[var(--doc-brand)]" placeholder="e.g. Over budget, timeline too long…" />
          <button type="button" disabled={pending} className={`${btn} bg-[#d92d20] text-white`} onClick={() => respond(false)}>{pending && <Loader2 className="size-4 animate-spin" />}Decline quote</button>
          <button type="button" className="text-sm font-medium text-[#475467]" onClick={() => setMode(null)}>Back</button>
        </div>
      )}

      {payable && (
        <div className="flex flex-col gap-2 border-t border-[#eaecf0] p-5">
          {providers.length > 0 ? (
            <>
              <p className="mb-1 text-[13px] font-medium text-[#475467]">Pay securely online</p>
              {providers.map((p, i) => (
                <button key={p.provider} type="button" disabled={pending} onClick={() => pay(p.provider)}
                  className={`${btn} ${i === 0 ? "text-white doc-brand-bg" : "bg-white text-[#344054] ring-1 ring-[#d0d5dd] hover:bg-[#f8f9fb]"}`}>
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}Pay {amount} with {NAMES[p.provider]}
                </button>
              ))}
              <p className="mt-1 flex items-center gap-1.5 text-xs text-[#98a2b3]"><ShieldCheck className="size-3.5" />Pay on {providers.map((p) => NAMES[p.provider]).join(" or ")}'s secure page.{providers.some((p) => p.mode === "test") && " (Test mode)"}</p>
            </>
          ) : !hasBank && <p className="text-sm text-[#475467]">Contact {brandName} for payment details.</p>}
          {hasBank && (
            <div className="mt-2 rounded-lg bg-[#f8f9fb] p-3.5 text-sm">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-[#475467]"><Landmark className="size-4" />Or pay by bank transfer</p>
              <p className="mt-2 font-medium">{bank.name}</p>
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-base font-semibold tracking-wide">{bank.number}</p>
                <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(bank.number); toast.success("Account number copied"); } catch { toast.error("Couldn't copy. Select the number and copy it yourself."); } setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#475467] ring-1 ring-[#d0d5dd]">{copied ? <Check className="size-3" /> : <Copy className="size-3" />}{copied ? "Copied" : "Copy"}</button>
              </div>
              <p className="text-[#475467]">{bank.account}</p>
              <p className="mt-1.5 text-xs text-[#98a2b3]">Reference: {bank.reference}. {brandName} will confirm and send your receipt.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
