import { NextResponse } from "next/server";
import { createSupabaseService } from "@/lib/supabase/server";
import { confirmAttempt } from "@/lib/payments";
import { siteUrl } from "@/lib/site";

// Bachs and Flutterwave send the customer back here. We never trust the URL:
// the attempt is re-checked with the provider before anything is recorded.
export async function GET(request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("ref") || url.searchParams.get("tx_ref") || "";
  const service = createSupabaseService();
  const { data: attempt } = await service.from("payment_attempts").select("purpose, document_id, business_id, provider, status").eq("reference", reference).maybeSingle();
  if (!attempt) return NextResponse.redirect(`${siteUrl()}/`);
  let state = attempt.status;
  if (state === "pending" && !url.searchParams.get("cancelled")) {
    try { state = (await confirmAttempt(reference)).state; } catch (e) { console.error("return.confirm_failed", { reference, message: e.message }); }
  }
  if (attempt.purpose === "connection_test") {
    return NextResponse.redirect(`${siteUrl()}/app/settings/payments?provider=${attempt.provider}&test=${state}`);
  }
  if (attempt.purpose === "subscription") {
    return NextResponse.redirect(`${siteUrl()}/app/settings/billing?payment=${state}`);
  }
  const { data: doc } = await service.from("documents").select("access_token").eq("id", attempt.document_id).single();
  const token = doc.access_token;
  const flag = url.searchParams.get("cancelled") ? "cancelled" : state;
  return NextResponse.redirect(`${siteUrl()}/d/${token}?payment=${flag}`);
}
