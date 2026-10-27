import { ForgotForm } from "@/components/auth-forms";
import { formToken, turnstileOn } from "@/lib/guard";
export const metadata = { title: "Reset password" };
export const dynamic = "force-dynamic"; // a fresh form token each time
export default function Page() { return <ForgotForm token={formToken()} turnstile={turnstileOn()} />; }
