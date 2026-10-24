// Writes the Supabase fallback email templates from the same layout the app
// uses. Run: node --import ./tests/register.mjs scripts/build-email-templates.mjs
// Paste each file into Supabase → Authentication → Emails. They're only used
// if the app's own email (Brevo) isn't configured.
import { writeFileSync } from "node:fs";
import { renderEmail } from "../lib/email-layout.js";
import { BRAND } from "../lib/brand.js";

const out = (file, subject, opts) => {
  const { html } = renderEmail(opts);
  writeFileSync(new URL(`../supabase/email-templates/${file}`, import.meta.url), `<!-- Supabase → Authentication → Emails. Subject: ${subject} -->\n${html}\n`);
};
const NOT_YOU = { intent: "warning", title: "Didn't ask for this?", text: "You can ignore this email. Nothing changes unless the code or link is used." };

out("confirm-signup.html", `Your ${BRAND.name} code: {{ .Token }}`, {
  preheader: "Confirm your email to finish creating your account.", eyebrow: "Confirm your email", heading: `Welcome to ${BRAND.name}`,
  paragraphs: ["Enter this code on the sign-up page to confirm your email and set up your business."],
  code: { value: "{{ .Token }}", caption: "Expires in 1 hour" }, button: { text: "Confirm my email", url: "{{ .ConfirmationURL }}" }, note: NOT_YOU,
});
out("reset-password.html", `Reset your ${BRAND.name} password`, {
  preheader: "Choose a new password.", eyebrow: "Password reset", heading: "Choose a new password",
  paragraphs: ["Use the button below to choose a new password for your account."],
  code: { value: "{{ .Token }}", caption: "Expires in 1 hour" }, button: { text: "Reset my password", url: "{{ .ConfirmationURL }}" }, note: NOT_YOU,
});
out("magic-link.html", `Your ${BRAND.name} sign-in code: {{ .Token }}`, {
  preheader: "Your sign-in code.", eyebrow: "Sign in", heading: `Your ${BRAND.name} code`,
  paragraphs: ["Enter this code to continue."],
  code: { value: "{{ .Token }}", caption: "Expires in 1 hour" }, button: { text: "Continue", url: "{{ .ConfirmationURL }}" }, note: NOT_YOU,
});
console.log("written");
