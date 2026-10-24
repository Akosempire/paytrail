import "server-only";
import { bachsMode, testBachsKey, validBachsKey } from "@/lib/payments/bachs";
import { flutterwaveMode, testFlutterwaveKey, validFlutterwaveKey } from "@/lib/payments/flutterwave";
import { stripeMode, testStripeKey, validStripeKey } from "@/lib/payments/stripe";
import { paystackMode, testPaystackKey, validPaystackKey } from "@/lib/payments/paystack";

// How each provider's keys look, how to check them, and whether a separate webhook secret is needed.
export const KEY_RULES = {
  stripe: {
    valid: validStripeKey, mode: stripeMode, check: testStripeKey, needsWebhookSecret: true,
    badKey: "That doesn't look like a Stripe secret key. It starts with sk_test_ (test) or sk_live_ (live).",
    badHook: "Paste the full signing secret Stripe shows for your webhook (it starts with whsec_).",
    hookPattern: /^whsec_[A-Za-z0-9]{16,}$/,
  },
  paystack: {
    valid: validPaystackKey, mode: paystackMode, check: testPaystackKey, needsWebhookSecret: false,
    badKey: "That doesn't look like a Paystack secret key. It starts with sk_test_ (test) or sk_live_ (live).",
  },
  flutterwave: {
    valid: validFlutterwaveKey, mode: flutterwaveMode, check: testFlutterwaveKey, needsWebhookSecret: true,
    badKey: "That doesn't look like a Flutterwave secret key. It starts with FLWSECK_TEST- (test) or FLWSECK- (live).",
    badHook: "Use a secret hash of at least 8 characters.",
  },
  bachs: {
    valid: validBachsKey, mode: bachsMode, check: testBachsKey, needsWebhookSecret: true,
    badKey: "That doesn't look like a Bachs secret key. It starts with sk_sandbox_ (test) or sk_live_ (live).",
    badHook: "Paste the full webhook signing secret from Bachs.",
  },
};

export function webhookSecretProblem(provider, hook) {
  const rule = KEY_RULES[provider];
  if (!rule?.needsWebhookSecret) return null;
  if (hook.length < 8) return rule.badHook;
  if (rule.hookPattern && !rule.hookPattern.test(hook)) return rule.badHook;
  return null;
}
