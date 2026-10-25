// Lets node:test import app modules: "@/x" → project root, "server-only" → no-op.
import { pathToFileURL } from "node:url";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
export async function resolve(specifier, context, next) {
  if (specifier === "server-only") return { url: "data:text/javascript,export{}", shortCircuit: true };
  // payment tests swap the database for an in-memory one (tests/fixtures/fake-supabase.mjs)
  if (specifier === "@/lib/supabase/server") return { url: pathToFileURL(path.join(root, "tests/fixtures/fake-supabase.mjs")).href, shortCircuit: true, format: "module" };
  if (specifier.startsWith("@/")) {
    let file = path.join(root, specifier.slice(2));
    if (!path.extname(file)) file += ".js";
    return { url: pathToFileURL(file).href, shortCircuit: true, format: "module" };
  }
  return next(specifier, context);
}
export async function load(url, context, next) {
  if (url.startsWith("file:") && url.endsWith(".js") && url.includes(root) && !url.includes("/node_modules/")) return { ...(await next(url, { ...context, format: "module" })), format: "module" };
  return next(url, context);
}
