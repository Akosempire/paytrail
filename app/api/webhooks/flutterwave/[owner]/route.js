import { handleWebhook } from "@/lib/payments/webhook";
export async function POST(request, { params }) {
  const { owner } = await params;
  return handleWebhook(request, "flutterwave", owner);
}
