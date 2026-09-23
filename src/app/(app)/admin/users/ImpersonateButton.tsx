"use client";
import { useState } from "react";

export function ImpersonateButton({ userId, userName }: { userId: string; userName: string }) {
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!confirm(`View the app as ${userName}? You'll see exactly what they see. Audit-logged.`)) return;
    setBusy(true);
    const res = await fetch("/api/admin/impersonate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    if (!res.ok) { setBusy(false); alert("Failed."); return; }
    window.location.href = "/dashboard";
  }
  return (
    <button onClick={go} disabled={busy} className="link text-xs ml-2">
      {busy ? "…" : "View as"}
    </button>
  );
}
