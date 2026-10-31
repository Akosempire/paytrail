// Nigerian banks and microfinance banks people most often pay into, for the
// searchable bank picker. Any other name can still be typed.
export const NG_BANKS = [
  "Access Bank", "Citibank Nigeria", "Ecobank Nigeria", "Fidelity Bank", "First Bank of Nigeria", "First City Monument Bank (FCMB)",
  "Globus Bank", "Guaranty Trust Bank (GTBank)", "Heritage Bank", "Jaiz Bank", "Keystone Bank", "Kuda Microfinance Bank",
  "Lotus Bank", "Moniepoint Microfinance Bank", "OPay", "Optimus Bank", "PalmPay", "Parallex Bank", "Polaris Bank",
  "Premium Trust Bank", "Providus Bank", "Stanbic IBTC Bank", "Standard Chartered Bank", "Sterling Bank", "SunTrust Bank",
  "Taj Bank", "Titan Trust Bank", "Union Bank of Nigeria", "United Bank for Africa (UBA)", "Unity Bank", "VFD Microfinance Bank",
  "Wema Bank (ALAT)", "Zenith Bank", "Carbon", "FairMoney Microfinance Bank", "Rubies Bank", "Sparkle Bank", "Paga", "Eyowo",
];

const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// best matches first: names that start with the search, then any word that does, then anywhere
export function searchBanks(q, list = NG_BANKS, limit = 8) {
  const t = norm(q);
  if (!t) return list.slice(0, limit);
  const scored = [];
  for (const name of list) {
    const n = norm(name);
    const score = n.startsWith(t) ? 0 : n.split(" ").some((w) => w.startsWith(t)) ? 1 : n.includes(t) ? 2 : -1;
    if (score >= 0) scored.push([score, name]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])).slice(0, limit).map(([, n]) => n);
}
