import "server-only";
import { askJson } from "@/lib/whatsapp/ai";
import { PASTE_AI_MAX, checkPasteAi, fillLonePrice, parseJson, pasteAiPrompt, repairPrompt } from "@/lib/paste-ai";

// Reads a pasted message with AI: ask, check the answer against the message,
// and if it doesn't add up, send the problems back once for a fix (two calls
// at most). Returns { understanding, items, customer, notes } or null.
export async function readMessageWithAi(ai, message, currency = "NGN") {
  const text = String(message || "").slice(0, PASTE_AI_MAX);
  const system = pasteAiPrompt(String(currency || "NGN").slice(0, 3));
  const reply = await askJson(ai, system, text);
  const first = checkPasteAi(parseJson(reply), text);
  let result = first.result;
  if (first.problems.length) {
    try {
      const again = await askJson(ai, system, [
        { role: "user", content: text },
        { role: "assistant", content: reply || "{}" },
        { role: "user", content: parseJson(reply) ? repairPrompt(first.problems) : "That wasn't valid JSON. Reply with the JSON only, in the shape asked for." },
      ]);
      const second = checkPasteAi(parseJson(again), text);
      if (second.result && (!result || second.problems.length <= first.problems.length)) result = second.result;
    } catch { /* keep the first answer */ }
  }
  return fillLonePrice(result, text);
}
