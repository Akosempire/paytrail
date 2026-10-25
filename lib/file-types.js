// Files people can attach to quotes and invoices. The type is decided from
// the file name, never from what the browser claims.
export const MAX_FILE_BYTES = 4 * 1024 * 1024; // Vercel accepts up to 4.5 MB per request
export const MAX_FILES = 10; // per document

export const FILE_TYPES = {
  pdf: { mime: "application/pdf", label: "PDF", inline: true },
  png: { mime: "image/png", label: "Image", inline: true, image: true },
  jpg: { mime: "image/jpeg", label: "Image", inline: true, image: true },
  jpeg: { mime: "image/jpeg", label: "Image", inline: true, image: true, ext: "jpg" },
  webp: { mime: "image/webp", label: "Image", inline: true, image: true },
  heic: { mime: "image/heic", label: "Image" },
  doc: { mime: "application/msword", label: "Word" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word" },
  xls: { mime: "application/vnd.ms-excel", label: "Excel" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel" },
  csv: { mime: "text/csv", label: "CSV" },
  txt: { mime: "text/plain", label: "Text" },
};
export const ACCEPT = Object.keys(FILE_TYPES).map((e) => `.${e}`).join(",");

export function fileTypeOf(name) {
  const ext = String(name || "").toLowerCase().match(/\.([a-z0-9]{1,5})$/)?.[1];
  const t = ext && FILE_TYPES[ext];
  return t ? { ...t, ext: t.ext || ext } : null;
}
export function typeOfMime(mime) {
  return Object.values(FILE_TYPES).find((t) => t.mime === mime) || null;
}
export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
// a safe display name: no folders, no control characters
export function cleanFileName(name) {
  const base = String(name || "file").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f"<>]/g, "").trim();
  return (base || "file").slice(-200);
}
