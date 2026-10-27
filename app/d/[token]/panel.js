"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CreditCard, Landmark, Loader2, ShieldCheck, ThumbsUp, Copy, Check, Send, Clock, AlertCircle, Paperclip } from "lucide-react";
import { respondToQuote, payDocument, claimPayment, acceptAndPay } from "./actions";
import { useToast } from "@/components/ui-client";

const NAMES = { stripe: "Stripe", paystack: "Paystack", bachs: "Bachs", flutterwave: "Flutterwave" };

// Light-only by design: this page is the business's branded document, not Usetally's app.
export function CustomerPanel({ token, doc, amount, paid, expired, providers, hasBank, bank, brandName, invoiceNumber, balance = 0, currency, claim, proofUpload }) {
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
  // the fast path: name (already filled in) + one tap → accepted and on the payment page
  function acceptPay(provider) {
    if (!name.trim()) return toast.error("Type your name to accept.");
    start(async () => {
      const id = toast.loading(`Accepting and opening secure ${NAMES[provider] || ""} checkout…`);
      const r = await acceptAndPay(token, { name, provider });
      if (r.url) { window.location.href = r.url; return; }
      toast.update(id, { intent: "error", message: r.error || "Something went wrong. Try again." });
      if (r.accepted) router.refresh();
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


      {/* one step: name is filled in, one tap accepts (and pays, when online payment is on) */}
      {awaitingReply && mode !== "decline" && (
        <div className="flex flex-col gap-2.5 border-t border-[#eaecf0] p-5">
          <label className="text-[13px] font-medium text-[#475467]" htmlFor="sig">Your name</label>
          <input id="sig" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className="h-11 rounded-lg px-3 text-[15px] ring-1 ring-[#d0d5dd] focus:outline-none focus:ring-2 focus:ring-[var(--doc-brand)]" />
          {providers.length > 0 ? providers.map((p, i) => (
            <button key={p.provider} type="button" disabled={pending} onClick={() => acceptPay(p.provider)}
              className={`${btn} ${i === 0 ? "h-12 text-white doc-brand-bg" : "bg-white text-[#344054] ring-1 ring-[#d0d5dd] hover:bg-[#f8f9fb]"}`}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}Accept & pay {amount}{providers.length > 1 ? ` with ${NAMES[p.provider]}` : ""}
            </button>
          )) : (
            <button type="button" disabled={pending} className={`${btn} h-12 text-white doc-brand-bg`} onClick={() => respond(true)}>{pending ? <Loader2 className="size-4 animate-spin" /> : <ThumbsUp className="size-4" />}Accept quote</button>
          )}
          {providers.length > 0 && <button type="button" disabled={pending} className={`${btn} bg-white text-[#344054] ring-1 ring-[#d0d5dd] hover:bg-[#f8f9fb]`} onClick={() => respond(true)}>{hasBank ? "Accept, pay by transfer" : "Accept, pay later"}</button>}
          <p className="text-xs text-[#98a2b3]">{providers.length > 0 ? `Paying accepts this quotation: its items, price and terms. You pay on ${providers.map((p) => NAMES[p.provider]).join(" or ")}'s secure page.` : "By accepting, you agree to the items, price and terms in this quotation."}</p>
          <button type="button" className="mt-1 text-sm font-medium text-[#475467] underline-offset-2 hover:underline" onClick={() => setMode("decline")}>Decline this quote</button>
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
              <p className="mt-1.5 text-xs text-[#98a2b3]">Put <strong className="font-semibold text-[#475467]">{bank.reference}</strong> in your transfer note so {brandName} can find it.</p>
            </div>
          )}
          {hasBank && <TransferClaim token={token} amountLabel={amount} brandName={brandName} balance={balance} currency={currency} claim={claim} proofUpload={proofUpload} defaultName={doc.customer_name} />}
        </div>
      )}
    </div>
  );
}

// "I've sent it": after a bank transfer the customer tells the business, with
// a screenshot if they have one. The business confirms and the receipt follows.
function TransferClaim({ token, amountLabel, brandName, balance, currency, claim, proofUpload, defaultName }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [file, setFile] = useState(null);
  const field = "h-11 w-full rounded-lg bg-white px-3 text-[15px] ring-1 ring-[#d0d5dd] focus:outline-none focus:ring-2 focus:ring-[var(--doc-brand)]";
  const label = "text-[13px] font-medium text-[#475467]";

  if (claim?.status === "pending" && !open) {
    return (
      <div className="mt-2 flex gap-3 rounded-lg bg-[#eff8ff] p-3.5 text-sm text-[#175cd3] ring-1 ring-[#b2ddff]">
        <Clock className="mt-0.5 size-4 shrink-0" />
        <p><strong className="font-semibold">{brandName} has been told</strong> you sent {claim.amount} on {claim.date}. You'll get your receipt as soon as they confirm it arrived.</p>
      </div>
    );
  }

  const send = (form) => start(async () => {
    const r = await claimPayment(token, form);
    if (r.error) return toast.error(r.error);
    setOpen(false);
    toast.success({ title: `${brandName} has been told`, message: r.proofSaved ? "You'll get your receipt once they confirm the money arrived." : "Your proof couldn't be saved, so keep it in case they ask. You'll get your receipt once they confirm." });
    router.refresh();
  });
  // one tap: the full balance, today, from the name on the invoice
  const quick = () => {
    const form = new FormData();
    form.set("amount", (balance / 100).toFixed(2));
    form.set("payer", defaultName || "");
    form.set("date", new Date().toISOString().slice(0, 10));
    send(form);
  };
  const submit = (e) => { e.preventDefault(); send(new FormData(e.currentTarget)); };

  return (
    <div className="mt-2 flex flex-col gap-2">
      {claim?.status === "rejected" && !open && (
        <div className="flex gap-3 rounded-lg bg-[#fffaeb] p-3.5 text-sm text-[#93370d] ring-1 ring-[#fedf89]">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p><strong className="font-semibold">{brandName} couldn't find your transfer of {claim.amount}.</strong>{claim.reply ? ` "${claim.reply}"` : ""} Check the details and tell them again, or contact them.</p>
        </div>
      )}
      {!open ? (
        <>
          <button type="button" onClick={quick} disabled={pending || !balance} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-white px-4 text-[15px] font-semibold text-[#344054] ring-1 ring-[#d0d5dd] hover:bg-[#f8f9fb] disabled:opacity-50">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}I've sent {amountLabel}
          </button>
          <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-medium text-[#475467] underline-offset-2 hover:underline">Paid a different amount or want to add proof?</button>
        </>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded-lg p-3.5 ring-1 ring-[#eaecf0]">
          <p className="text-[14px] font-semibold">Tell {brandName} you've paid</p>
          <div className="flex flex-col gap-1.5">
            <label className={label} htmlFor="claim-amount">Amount you sent ({currency})</label>
            <input id="claim-amount" name="amount" inputMode="decimal" required defaultValue={balance ? (balance / 100).toFixed(2).replace(/\.00$/, "") : ""} className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={label} htmlFor="claim-payer">Name on the account you paid from</label>
            <input id="claim-payer" name="payer" required maxLength={120} defaultValue={defaultName || ""} className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className={label} htmlFor="claim-date">Date you paid</label>
            <input id="claim-date" name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} className={field} />
          </div>
          {proofUpload && (
            <div className="flex flex-col gap-1.5">
              <span className={label}>Screenshot or PDF of the transfer <span className="font-normal text-[#98a2b3]">(optional, helps them find it)</span></span>
              <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg bg-white px-3 text-[14px] text-[#475467] border border-dashed border-[#d0d5dd] hover:bg-[#f8f9fb]">
                <Paperclip className="size-4 shrink-0" /><span className="truncate">{file ? file : "Choose a file"}</span>
                <input name="proof" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,image/*,application/pdf" className="sr-only" onChange={(e) => setFile(e.target.files?.[0]?.name || null)} />
              </label>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label className={label} htmlFor="claim-note">Note <span className="font-normal text-[#98a2b3]">(optional)</span></label>
            <input id="claim-note" name="note" maxLength={500} placeholder="e.g. Paid from GTBank" className={field} />
          </div>
          <button type="submit" disabled={pending} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-[15px] font-semibold text-white doc-brand-bg disabled:opacity-50">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}Send to {brandName}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-[#475467]">Cancel</button>
        </form>
      )}
    </div>
  );
}
