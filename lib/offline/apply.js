import { friendlyError } from "@/lib/context";
import { cleanPayload } from "@/lib/documents";
import { can } from "@/lib/permissions";
import { toMinor } from "@/lib/money";
import { sendDocumentInternal } from "@/lib/document-send";

// Applies changes made offline, in the order they were made. Each change has an
// id: one already applied returns its earlier result instead of running twice.
// Changes may point at documents or customers created offline ("local:…" ids);
// the replies say which real ids and numbers they got.
export const LOCAL = /^local:[a-z0-9-]{6,60}$/;

export async function applyOfflineOps(ctx, service, ops, knownIds = {}) {
  ops = Array.isArray(ops) ? ops.slice(0, 100) : [];
  const ids = { ...(knownIds || {}) }; // local id -> real id, known from earlier syncs
  const resolve = (v) => (LOCAL.test(String(v || "")) ? ids[v] || null : v || null);
  const results = [];
  for (const op of ops) {
    const opId = String(op?.id || "");
    if (!/^[A-Za-z0-9:_-]{8,80}$/.test(opId)) { results.push({ id: opId, error: "Invalid change." }); continue; }
    // claim the change; one already done answers with what it did before
    const { error: claim } = await service.from("offline_ops").insert({ id: opId, business_id: ctx.business.id, user_id: ctx.user.id, kind: String(op.kind).slice(0, 40), result: { pending: true } });
    if (claim) {
      const { data: done } = await service.from("offline_ops").select("result, business_id, created_at").eq("id", opId).maybeSingle();
      if (!done) results.push({ id: opId, error: /offline_ops/.test(claim.message || "") ? "Offline sync needs a database update (RUN_NEW_2026-10-26a.sql)." : "Couldn't sync. Trying again soon.", retry: true });
      else if (done.business_id !== ctx.business.id) results.push({ id: opId, error: "Invalid change." });
      else if (!done.result?.pending) {
        if (done.result?.localId && done.result?.realId) ids[done.result.localId] = done.result.realId;
        results.push({ id: opId, ...done.result, repeated: true });
      } else if (Date.now() - Date.parse(done.created_at) > 10 * 60 * 1000) {
        // started long ago and never finished: don't risk doing it twice
        results.push({ id: opId, error: "This change may not have been saved. Check it and make it again if it's missing." });
      } else results.push({ id: opId, error: "Still being applied. It will finish on the next sync.", retry: true });
      continue;
    }
    let result;
    try { result = await apply(ctx, op, resolve); } catch (e) { result = { error: String(e?.message || e).slice(0, 300) }; }
    if (result.localId && result.realId) ids[result.localId] = result.realId;
    if (result.retry) await service.from("offline_ops").delete().eq("id", opId);
    else await service.from("offline_ops").update({ result }).eq("id", opId);
    results.push({ id: opId, ...result });
  }
  return { results, ids };
}

async function apply(ctx, op, resolve) {
  const sb = ctx.supabase, b = ctx.business;
  if (op.kind === "customer.save") {
    const f = op.form || {};
    const row = { name: String(f.name || "").trim().slice(0, 120), company: String(f.company || "").trim().slice(0, 120), email: String(f.email || "").trim().toLowerCase().slice(0, 200),
      phone: String(f.phone || "").trim().slice(0, 40), address: String(f.address || "").trim().slice(0, 500), notes: String(f.notes || "").trim().slice(0, 2000), updated_at: new Date().toISOString() };
    if (!row.name) return { error: "A customer needs a name." };
    const id = resolve(op.customerId);
    if (id) {
      const { error } = await sb.from("customers").update(row).eq("id", id).eq("business_id", b.id);
      return error ? { error: "Could not save the customer." } : { ok: true, realId: id };
    }
    const { data, error } = await sb.from("customers").insert({ ...row, business_id: b.id }).select("id").single();
    return error ? { error: "Could not save the customer." } : { ok: true, localId: op.customerId, realId: data.id };
  }
  if (op.kind === "document.save") {
    const input = { ...(op.input || {}) };
    if (input.customer_id) { input.customer_id = resolve(input.customer_id); if (!input.customer_id) return { error: "Its customer couldn't be saved.", retry: false }; }
    const payload = cleanPayload(input);
    if (!payload.customer_id && !payload.customer?.name) return { error: "Choose a customer or add a new one." };
    if (!payload.items.length) return { error: "Add at least one item." };
    let docId = resolve(op.docId), conflict = false;
    if (docId) {
      // edited offline but changed elsewhere since (or no longer a draft): keep both, save ours as a copy
      const { data: cur } = await sb.from("documents").select("status, updated_at").eq("id", docId).eq("business_id", b.id).maybeSingle();
      if (!cur || !["draft", "pending_approval"].includes(cur.status) || (op.baseUpdatedAt && new Date(cur.updated_at) > new Date(op.baseUpdatedAt))) {
        conflict = true; docId = null;
        payload.title = `${payload.title || ""} (offline copy)`.trim().slice(0, 200);
        if (!payload.kind) payload.kind = op.input?.kind === "invoice" ? "invoice" : "quote";
      }
    }
    const { data: id, error } = await sb.rpc("save_document", { target: b.id, doc_id: docId, payload });
    if (error) return { error: friendlyError(error) };
    const { data: saved } = await sb.from("documents").select("number").eq("id", id).maybeSingle();
    const out = { ok: true, localId: LOCAL.test(String(op.docId || "")) ? op.docId : conflict ? `copy:${op.docId}` : undefined, realId: id, number: saved?.number, conflict };
    if (conflict) out.message = "This document was changed on another device while you were offline, so your version was saved as a separate copy.";
    return out;
  }
  if (op.kind === "document.send") {
    const id = resolve(op.docId);
    if (!id) return { error: "This document hasn't synced yet.", retry: true };
    // sending for approval is for anyone; the database checks who may submit
    if (op.submit) { const { error } = await sb.rpc("submit_document", { doc_id: id }); return error ? { error: friendlyError(error) } : { ok: true }; }
    if (!can(ctx.member, "documents.send") && !(ctx.member.role === "junior_finance" && !b.require_approval)) return { error: "A manager or finance officer needs to approve and send this." };
    const r = await sendDocumentInternal(ctx, id, { email: Boolean(op.email) });
    return r.error ? { error: r.error } : { ok: true, emailed: r.emailed };
  }
  if (op.kind === "payment.record") {
    const id = resolve(op.docId);
    if (!id) return { error: "This document hasn't synced yet.", retry: true };
    const amount = toMinor(op.form?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter the amount you received." };
    const { error } = await sb.rpc("record_manual_payment", { doc_id: id, pay_method: String(op.form.method || "bank_transfer"), pay_reference: String(op.form.reference || "").slice(0, 120),
      pay_amount: amount, pay_note: String(op.form.note || "").slice(0, 500), pay_date: op.form.date || null });
    return error ? { error: friendlyError(error) } : { ok: true };
  }
  return { error: "Unknown change." };
}
