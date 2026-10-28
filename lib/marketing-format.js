import { formatMoney } from "./money.js";
// amounts in the ad account's currency (major units, e.g. 1500.5); naira shown whole
export const moneyIn = (cur) => (v) => (v == null ? "—" : formatMoney(cur === "USD" ? Math.round(Number(v) * 100) : Math.round(Number(v)) * 100, cur || "NGN"));
