// WhatsApp community sign-ups: the form's choices, checking what was typed,
// and when to send a reminder. Pure, so it's tested.

export const STAGES = [
  "Idea stage (not started yet)",
  "Just started (under 1 year)",
  "Growing (1–3 years)",
  "Established (3+ years)",
  "Scaling or raising investment",
];

// reminders go out this many days after signing up, until the join link is clicked
export const REMIND_AFTER_DAYS = [1, 3, 7];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// → { data } or { error, field }
export function checkSignup(input, batches = []) {
  const name = clip(input?.name, 120);
  const email = clip(input?.email, 200).toLowerCase();
  const phone = clip(input?.phone, 40);
  const batch = clip(input?.batch, 80);
  const business_name = clip(input?.business_name, 160);
  const stage = clip(input?.stage, 80);
  const consent = input?.consent === true || input?.consent === "yes";
  if (input?.website) return { error: "Something went wrong. Please try again.", field: "" }; // the hidden field only bots fill
  if (!name) return { error: "Enter your name.", field: "name" };
  if (!EMAIL.test(email)) return { error: "Enter a valid email address. The group link is sent there.", field: "email" };
  if (phone.replace(/\D/g, "").length < 7) return { error: "Enter your WhatsApp phone number.", field: "phone" };
  if (batch && batches.length && !batches.includes(batch)) return { error: "Choose a batch from the list, or leave it empty.", field: "batch" }; // optional
  if (!business_name) return { error: "Enter your business name.", field: "business_name" };
  if (!STAGES.includes(stage)) return { error: "Choose the stage of your business.", field: "stage" };
  if (input?.consent === "no") return { error: "The community is only for people who agree to its rules.", field: "consent" };
  if (!consent) return { error: "Choose Yes to agree to the community rules.", field: "consent" };
  return { data: { name, email, phone, batch, business_name, stage, consent: true } };
}

// is a reminder due for this sign-up now?
export function reminderDue(row, now = Date.now()) {
  if (!row || row.clicked_at || row.stopped_at || !row.emailed_at) return false;
  const n = Number(row.reminders || 0);
  if (n >= REMIND_AFTER_DAYS.length) return false;
  const since = now - Date.parse(row.created_at);
  return since >= REMIND_AFTER_DAYS[n] * 86400_000 - 3600_000; // an hour early is fine for a daily job
}

// "one, two, three" → ["one", "two", "three"] (the admin types batches one per line or with commas)
export const parseBatches = (text) => [...new Set(String(text || "").split(/[\n,]/).map((s) => clip(s, 80)).filter(Boolean))].slice(0, 50);
