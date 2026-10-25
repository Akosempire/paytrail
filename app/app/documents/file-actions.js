"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireBusiness } from "@/lib/context";
import { createSupabaseService } from "@/lib/supabase/server";
import { can } from "@/lib/permissions";
import { r2Delete, r2Put, r2Ready } from "@/lib/storage";
import { MAX_FILES, MAX_FILE_BYTES, cleanFileName, fileTypeOf, formatSize } from "@/lib/file-types";

// Files attached to a quote or invoice: contracts, delivery notes, proof of
// payment. Stored privately on Cloudflare R2; the customer only sees the
// ones marked "Customer can see".

const who = (ctx) => ctx.member.full_name || ctx.user.email;
const log = (ctx, documentId, action, detail) => createSupabaseService().from("activity")
  .insert({ business_id: ctx.business.id, document_id: documentId, actor_id: ctx.user.id, actor_label: who(ctx), action, detail }).then(() => {}, () => {});
const missingTable = (e) => /document_files/.test(e?.message || "") && /exist|schema cache/i.test(e?.message || "");
const NEEDS_SQL = "Attachments need a database update. Run the latest SQL in Supabase, then try again.";

async function guard(work) {
  try { return await work(); }
  catch (e) { console.error("document_files.failed", { message: e?.message }); return { error: "Something went wrong with the file. Try again." }; }
}

export async function uploadDocumentFile(documentId, form) {
  return guard(async () => {
    const ctx = await requireBusiness();
    if (!can(ctx.member, "documents.create")) return { error: "Your role can't add files." };
    if (!r2Ready()) return { error: "File storage isn't connected yet (Cloudflare R2 settings in Vercel)." };
    const file = form.get("file");
    if (!file || typeof file === "string" || !file.size) return { error: "Choose a file to attach." };
    const type = fileTypeOf(file.name);
    if (!type) return { error: "Attach a PDF, photo, Word, Excel, CSV or text file." };
    if (file.size > MAX_FILE_BYTES) return { error: `That file is ${formatSize(file.size)}. Files can be up to 4 MB.` };

    const { data: doc } = await ctx.supabase.from("documents").select("id").eq("id", documentId).eq("business_id", ctx.business.id).maybeSingle();
    if (!doc) return { error: "This document wasn't found." };
    const { count, error: countError } = await ctx.supabase.from("document_files").select("id", { count: "exact", head: true }).eq("document_id", doc.id);
    if (countError) return { error: missingTable(countError) ? NEEDS_SQL : "Couldn't check the files. Try again." };
    if ((count || 0) >= MAX_FILES) return { error: `A document can have up to ${MAX_FILES} files. Remove one first.` };

    const id = randomUUID(), key = `${ctx.business.id}/docs/${doc.id}/${id}.${type.ext}`, name = cleanFileName(file.name);
    await r2Put(key, Buffer.from(await file.arrayBuffer()), type.mime);
    const { error } = await ctx.supabase.from("document_files").insert({ id, business_id: ctx.business.id, document_id: doc.id, name, content_type: type.mime,
      size_bytes: file.size, storage_key: key, uploaded_by: ctx.user.id, uploaded_by_name: who(ctx) });
    if (error) { await r2Delete(key).catch(() => {}); return { error: missingTable(error) ? NEEDS_SQL : "The file couldn't be saved. Try again." }; }
    await log(ctx, doc.id, "file.added", { name });
    revalidatePath(`/app/documents/${doc.id}`);
    return { ok: true, message: `${name} is attached.` };
  });
}

export async function setFileShared(fileId, shared) {
  return guard(async () => {
    const ctx = await requireBusiness();
    if (!can(ctx.member, "documents.send")) return { error: "Only owners, managers and finance officers can share files with customers." };
    const { data, error } = await ctx.supabase.from("document_files").update({ shared: Boolean(shared) }).eq("id", fileId).eq("business_id", ctx.business.id).select("document_id, name");
    if (error || !data?.length) return { error: "That file couldn't be updated." };
    await log(ctx, data[0].document_id, shared ? "file.shared" : "file.unshared", { name: data[0].name });
    revalidatePath(`/app/documents/${data[0].document_id}`);
    return { ok: true, message: shared ? `Your customer can now see ${data[0].name} on their link.` : `${data[0].name} is now just for your team.` };
  });
}

export async function deleteDocumentFile(fileId) {
  return guard(async () => {
    const ctx = await requireBusiness();
    const { data: f } = await ctx.supabase.from("document_files").select("id, document_id, name, storage_key, uploaded_by").eq("id", fileId).eq("business_id", ctx.business.id).maybeSingle();
    if (!f) return { error: "That file wasn't found." };
    if (!can(ctx.member, "documents.send") && f.uploaded_by !== ctx.user.id) return { error: "You can only remove files you added." };
    const { data: gone, error } = await ctx.supabase.from("document_files").delete().eq("id", f.id).select("id");
    if (error || !gone?.length) return { error: "That file couldn't be removed." };
    await r2Delete(f.storage_key).catch(() => {});
    await log(ctx, f.document_id, "file.removed", { name: f.name });
    revalidatePath(`/app/documents/${f.document_id}`);
    return { ok: true, message: `${f.name} was removed.` };
  });
}
