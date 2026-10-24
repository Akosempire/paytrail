import { EditorPage } from "@/components/editor-page";
export const metadata = { title: "Edit document" };
export default async function Page({ params }) {
  const { id } = await params;
  return <EditorPage id={id} />;
}
