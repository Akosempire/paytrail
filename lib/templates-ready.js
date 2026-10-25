import "server-only";
import { previewEnabled } from "@/lib/supabase/preview";

// Has the receipt-templates SQL been run? The updated template_fits() says a
// "ledger" invoice doesn't fit; the old one said it did. Until it has run,
// the new templates stay hidden, because receipts couldn't be saved with them.
export async function newTemplatesReady(supabase) {
  if (previewEnabled()) return true;
  try {
    const { data, error } = await supabase.rpc("template_fits", { kind: "invoice", tpl: "ledger", paper: "a4" });
    return !error && data === false;
  } catch { return false; }
}
