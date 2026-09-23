"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ApprovalActions({ articleId }: { articleId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function approve() {
    setBusy(true);
    await fetch(`/api/knowledge/articles/${articleId}/approve`, { method: "POST" });
    setBusy(false);
    router.refresh();
  }
  async function reject() {
    const reason = prompt("Reason for rejecting? (optional, shown to author)");
    if (reason === null) return;
    setBusy(true);
    await fetch(`/api/knowledge/articles/${articleId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-1.5 shrink-0">
      <button onClick={approve} disabled={busy} className="btn-primary text-xs">Approve</button>
      <button onClick={reject} disabled={busy} className="btn-ghost text-xs text-brand-red">Reject</button>
    </div>
  );
}
