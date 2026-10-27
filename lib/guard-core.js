// Pure helpers for lib/guard.js (no server imports, so they can be tested).

// the form's signed time: returns how old it is in ms, or null if it isn't ours
export function readFormToken(value, verify, now = Date.now()) {
  const [t, mac] = String(value || "").split(".");
  if (!/^\d{12,14}$/.test(t || "") || !verify(t, mac)) return null;
  const age = now - Number(t);
  return age >= 0 && age < 24 * 3600_000 ? age : null;
}

// throwaway inboxes bots use to sign up in bulk
const THROWAWAY = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "sharklasers.com", "grr.la", "10minutemail.com", "10minutemail.net",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net", "tempmailo.com", "tempr.email", "yopmail.com", "yopmail.fr", "trashmail.com", "trashmail.de",
  "dispostable.com", "getnada.com", "nada.email", "maildrop.cc", "throwawaymail.com", "fakeinbox.com", "mohmal.com", "emailondeck.com", "mintemail.com",
  "mailnesia.com", "mytemp.email", "spamgourmet.com", "burnermail.io", "moakt.com", "tmail.ws", "tmpmail.org", "tmpmail.net", "inboxkitten.com",
  "mailcatch.com", "spambox.us", "33mail.com", "discard.email", "mail.tm", "linshiyouxiang.net", "emailfake.com", "fakemail.net", "dropmail.me", "1secmail.com",
]);
export function isThrowawayEmail(email) {
  const domain = String(email || "").split("@")[1]?.toLowerCase().trim() || "";
  return THROWAWAY.has(domain) || [...THROWAWAY].some((d) => domain.endsWith(`.${d}`));
}
