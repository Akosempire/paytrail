"use client";
import { useEffect } from "react";
import { confettiBurst } from "@/components/confetti";

// One confetti burst the first time someone on this device sees an invoice
// that was paid in the last 10 minutes (an online payment, say). Recording the
// payment yourself celebrates straight away and marks it seen.
export function celebrateOnce(docId) {
  try { if (sessionStorage.getItem(`paid:${docId}`)) return; sessionStorage.setItem(`paid:${docId}`, "1"); } catch { /* storage blocked: still one burst per visit */ }
  confettiBurst();
}

export function PaidCelebration({ docId, paidAt }) {
  useEffect(() => {
    if (!paidAt || Date.now() - new Date(paidAt).getTime() > 10 * 60000) return;
    const t = setTimeout(() => celebrateOnce(docId), 300);
    return () => clearTimeout(t);
  }, [docId, paidAt]);
  return null;
}
