"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function EmailChangeRow({
  request,
  user,
}: {
  request: { id: string; currentEmail: string; requestedEmail: string; requestedAt: string };
  user: { name: string; role: string; org: { name: string } } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    const res = await fetch(`/api/admin/email-changes/${request.id}/approve`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || "Failed");
      return;
    }
    router.refresh();
  }
  async function reject() {
    const reason = prompt("Reason (optional):");
    if (reason === null) return;
    setBusy(true);
    await fetch(`/api/admin/email-changes/${request.id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <li className="px-5 py-3 flex items-start justify-between gap-3 hover:bg-brand-indigo/5">
      <div className="flex-1 min-w-0">
        <div className="font-medium">{user?.name ?? "?"} <span className="meta">({user?.role.replace("_", " ")} · {user?.org.name})</span></div>
        <div className="text-sm font-mono mt-0.5">{request.currentEmail} → <strong>{request.requestedEmail}</strong></div>
        <div className="meta mt-0.5">Requested {new Date(request.requestedAt).toLocaleString()}</div>
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <button onClick={approve} disabled={busy} className="btn-primary text-xs">Approve</button>
        <button onClick={reject} disabled={busy} className="btn-ghost text-xs text-brand-red">Reject</button>
      </div>
    </li>
  );
}
