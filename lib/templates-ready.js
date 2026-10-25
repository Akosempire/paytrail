import "server-only";
import { previewEnabled } from "@/lib/supabase/preview";

// Which newer templates the database already accepts. Each update changes
// template_fits(), so its answer tells us what has been run:
//   receipt templates (Ledger, Bold): a "ledger" invoice no longer fits
//   Merchant: an unknown template no longer "fits" (the old version said any did)
// Until then those templates stay hidden, because documents couldn't be saved with them.
export async function readyTemplates(supabase) {
  if (previewEnabled()) return ["ledger", "bold", "merchant"];
  const ask = async (kind, tpl) => {
    try { const { data, error } = await supabase.rpc("template_fits", { kind, tpl, paper: "a4" }); return error ? null : data; } catch { return null; }
  };
  const [ledgerInvoice, unknown] = await Promise.all([ask("invoice", "ledger"), ask("quote", "no-such-template")]);
  return [...(ledgerInvoice === false ? ["ledger", "bold"] : []), ...(unknown === false ? ["merchant"] : [])];
}

// kept for older callers
export async function newTemplatesReady(supabase) {
  return (await readyTemplates(supabase)).includes("ledger");
}

export const SQL_FOR = { receipts: "supabase/RUN_NEW_2026-10-25d.sql", merchant: "supabase/RUN_NEW_2026-10-25g.sql" };
