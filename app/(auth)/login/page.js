import { LoginForm } from "@/components/auth-forms";
export const metadata = { title: "Sign in" };
export default async function Page({ searchParams }) {
  const { next } = await searchParams;
  return <LoginForm next={next} />;
}
