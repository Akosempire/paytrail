// "Ideas & help": the pure parts (tested in tests/feedback.test.mjs).

export const KINDS = {
  feature: { label: "Feature idea", verb: "Request a feature", hint: "Something you wish Usetally did" },
  problem: { label: "Problem", verb: "Report a problem", hint: "Something isn't working as it should" },
  question: { label: "Question", verb: "Ask a question", hint: "How to do something, or anything you're unsure of" },
  other: { label: "Other", verb: "Something else", hint: "Anything you'd like to tell us" },
};
export const STATUSES = {
  open: { label: "Open", tone: "brand" },
  planned: { label: "Planned", tone: "violet" },
  done: { label: "Done", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
};

const clean = (v, max) => String(v ?? "").replace(/\r\n/g, "\n").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);

// what the form sent → { ok, value } or { error }
export function checkNewThread(form) {
  const kind = String(form.kind || "");
  if (!KINDS[kind]) return { error: "Choose what this is about." };
  const subject = clean(form.subject, 140).replace(/\s+/g, " ");
  if (subject.length < 3) return { error: "Add a short title (at least 3 characters)." };
  const body = clean(form.body, 5000);
  if (!body) return { error: "Write your message." };
  return { ok: true, value: { kind, subject, body, page: clean(form.page, 200).replace(/\s+/g, "") } };
}

export function checkReply(body) {
  const b = clean(body, 5000);
  return b ? { ok: true, value: b } : { error: "Write your message." };
}

// first lines for an email preview
export function preview(body, max = 280) {
  const b = String(body || "").replace(/\s+/g, " ").trim();
  return b.length > max ? `${b.slice(0, max - 1)}…` : b;
}
