import { redirect } from "next/navigation";
import { EditorPage } from "@/components/editor-page";
export const metadata = { title: "New quotation" };

// Quotes opens straight into a new quote. The full list is at /app/quotes/all;
// old list links (?status=…, ?q=…) are sent there.
export default async function Page({ searchParams }) {
  const { customer, ...rest } = (await searchParams) || {};
  const list = new URLSearchParams(Object.entries(rest).filter(([k, v]) => ["status", "q", "page", "sort"].includes(k) && typeof v === "string"));
  if ([...list.keys()].length) redirect(`/app/quotes/all?${list}`);
  return <EditorPage kind="quote" customerId={customer} />;
}
