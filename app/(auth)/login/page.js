import { LoginForm } from "@/components/auth-forms";
export const metadata = { title: "Sign in" };
export default async function Page({ searchParams }) {
  const { next, link } = await searchParams;
  return <LoginForm next={next} notice={link === "expired" ? "That link has expired or was already used. Sign in, or ask for a new link." : null} />;
}
