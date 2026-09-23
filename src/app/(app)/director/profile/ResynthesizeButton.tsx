"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Profile re-synthesis trigger — role-aware (v3.37.10).
 *
 *   ORG_ADMIN | COMPANY_ADMIN  → "Re-run synthesis" → fires /api/synthesis-retry directly.
 *   DIRECTOR  | VP_SALES | AE → "Request re-synthesis" → posts to /api/synthesis-request.
 *     Server creates a task assigned to a company admin. We show a confirmation
 *     toast and disable the button to prevent dupe requests in this session.
 *
 * Why split: re-synthesis costs Grok dollars and overwrites the profile.
 * Admins control when it runs; everyone else makes a tracked request.
 */
export function ResynthesizeButton({ role }: { role: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const isAdmin = role === "ORG_ADMIN" || role === "COMPANY_ADMIN";

  async function adminRetry() {
    if (!window.confirm("Re-run synthesis? This overwrites your current profile summaries and skill scores. Takes about 5-10 minutes.")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/synthesis-retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setErr(j.error ?? "Couldn't kick off re-synthesis.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch {
      setErr("Network error.");
      setBusy(false);
    }
  }

  async function userRequest() {
    const reason = window.prompt(
      "Send a re-synthesis request to your admin? Add a one-line reason (optional).",
      "",
    );
    if (reason === null) return; // user clicked Cancel
    setBusy(true);
    setErr(null);
    setConfirmation(null);
    try {
      const res = await fetch("/api/synthesis-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(j.error ?? "Couldn't submit request.");
        setBusy(false);
        return;
      }
      setConfirmation(
        j.duplicate
          ? `You already have a pending request with ${j.assigneeName}.`
          : `Request sent to ${j.assigneeName}. They'll re-run when ready.`,
      );
      // Keep busy=true so the button stays disabled — request is in flight.
    } catch {
      setErr("Network error.");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {err && <span className="text-xs text-brand-red">{err}</span>}
      {confirmation && <span className="text-xs text-brand-emerald">{confirmation}</span>}
      <button
        type="button"
        onClick={isAdmin ? adminRetry : userRequest}
        disabled={busy}
        className="btn-secondary text-sm whitespace-nowrap"
      >
        {busy
          ? (isAdmin ? "Starting…" : "Sending…")
          : (isAdmin ? "↻ Re-run synthesis" : "↻ Request re-synthesis")}
      </button>
    </div>
  );
}
