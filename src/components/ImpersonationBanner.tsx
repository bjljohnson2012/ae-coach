"use client";
import { useState } from "react";

export function ImpersonationBanner({ targetName, targetRole }: { targetName: string; targetRole: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function exit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "DELETE",
        // Force browser to NOT auto-follow redirects; we only care if the cookie cleared.
        redirect: "manual",
      });
      // Hard-reload to admin/users — fresh server render uses the (now ORG_ADMIN) session.
      window.location.href = "/admin/users";
    } catch (e) {
      setBusy(false);
      setError("Couldn't exit. Try refreshing the page.");
    }
  }

  return (
    <div className="bg-brand-amber text-[#5a3a00] px-4 py-2 text-sm flex items-center justify-between gap-3 border-b border-amber-300">
      <div>
        <strong>Impersonating</strong> {targetName} ({targetRole.replace("_", " ")}). All actions are audit-logged.
        {error && <span className="ml-3 text-brand-red">{error}</span>}
      </div>
      <button
        onClick={exit}
        disabled={busy}
        className="bg-white text-brand-amber font-semibold px-3 py-1 rounded-brand text-xs hover:bg-amber-50 disabled:opacity-50"
      >
        {busy ? "Exiting…" : "Exit impersonation"}
      </button>
    </div>
  );
}
