"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function CompleteForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function complete(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "DONE" }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button onClick={complete} className="btn-secondary text-xs" disabled={busy}>
      {busy ? "…" : "Mark done"}
    </button>
  );
}
