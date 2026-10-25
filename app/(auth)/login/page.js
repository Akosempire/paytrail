import { LoginForm } from "@/components/auth-forms";
import { googleEnabled } from "@/lib/auth-providers";
export const metadata = { title: "Sign in" };
export default async function Page({ searchParams }) {
  const { next } = await searchParams;
  return <LoginForm next={next} google={await googleEnabled()} />;
}
