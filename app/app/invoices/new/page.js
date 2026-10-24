import { EditorPage } from "@/components/editor-page";
export const metadata = { title: "New invoice" };
export default async function Page({ searchParams }) {
  const { customer } = await searchParams;
  return <EditorPage kind="invoice" customerId={customer} />;
}
