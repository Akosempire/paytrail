"use server";
import { newTemplatesReady } from "@/lib/templates-ready";
import { TEMPLATES } from "@/lib/doc-templates";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/context";
import { cleanLayout, fits } from "@/lib/doc-templates";

// default template, paper and sections per document type
export async function saveDocumentDefaults(kind, input) {
  const ctx = await requirePermission("settings.business");
  if (!["quote", "invoice", "receipt"].includes(kind)) return { error: "Unknown document type." };
  if (!fits(kind, input.template, input.paper)) return { error: "That template isn't available for this paper size." };
  if (TEMPLATES[input.template]?.needsUpdate && !(await newTemplatesReady(ctx.supabase))) return { error: "This template needs a quick database update first. Run supabase/RUN_NEW_2026-10-25d.sql in Supabase, then try again." };
  const prefs = { ...(ctx.business.document_prefs || {}), [kind]: { template: input.template, paper: input.paper, layout: cleanLayout(input.layout) } };
  const { error } = await ctx.supabase.from("businesses").update({ document_prefs: prefs }).eq("id", ctx.business.id);
  if (error) return { error: "Could not save. Try again." };
  revalidatePath("/app/settings/documents");
  return { message: "Default saved. New documents will use it; documents already sent keep their look." };
}
