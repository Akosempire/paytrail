import { requireBusiness } from "@/lib/context";
import { DocumentListPage } from "@/components/document-list";
export const metadata = { title: "Quotes" };
export default async function Page({ searchParams }) {
  const ctx = await requireBusiness();
  return <DocumentListPage ctx={ctx} kind="quote" searchParams={await searchParams} />;
}
