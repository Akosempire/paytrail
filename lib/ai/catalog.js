import "server-only";
import * as z from "zod";
import { registerTools } from "@/lib/ai/tools";

// The tool list for the public docs (/docs/mcp), read from the same
// definitions the MCP server uses, so the docs can't drift from what's live.
export function toolCatalog() {
  const tools = [];
  const collector = { registerTool: (name, config) => tools.push({ name, ...config }) };
  registerTools(collector, { service: {}, userId: "", business: { id: "", name: "your business", currency: "NGN" }, member: { role: "owner" }, scope: "read write", site: "", appName: "" });
  return tools.map((t) => {
    const schema = z.toJSONSchema(z.object(t.inputSchema || {}), { io: "input" });
    const required = new Set(schema.required || []);
    const typeOf = (p) => p.type || (p.anyOf ? p.anyOf.map((x) => x.type).filter(Boolean).join(" or ") : p.enum ? "string" : "object");
    const row = (name, p, req) => ({ name, required: req && p.default === undefined, type: typeOf(p), values: p.enum || null, description: p.description || "" });
    const params = [];
    for (const [name, p] of Object.entries(schema.properties || {})) {
      params.push(row(name, p, required.has(name)));
      // one level down: the customer's fields, each item's fields
      const inner = p.type === "object" ? p : p.type === "array" ? p.items : null;
      if (inner?.properties) {
        const req = new Set(inner.required || []);
        for (const [sub, q] of Object.entries(inner.properties)) params.push({ ...row(`${name}${p.type === "array" ? "[]" : ""}.${sub}`, q, req.has(sub)), nested: true });
      }
    }
    const a = t.annotations || {};
    return { name: t.name, title: t.title, description: t.description, params, access: a.readOnlyHint ? "read" : a.destructiveHint ? "destructive" : "write", openWorld: Boolean(a.openWorldHint) };
  });
}
