import { EditorPage } from "@/components/editor-page";
export const metadata = { title: "New quotation" };
export default async function Page({ searchParams }) {
  const { customer } = await searchParams;
  return <EditorPage kind="quote" customerId={customer} />;
}
