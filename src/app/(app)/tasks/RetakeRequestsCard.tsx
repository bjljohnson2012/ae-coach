"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface RetakeReq {
  id: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "CANCELLED";
  reason: string | null;
  createdAt: string;
  decidedAt: string | null;
  requester: { id: string; name: string; email: string; role: string };
  adHocQuiz: { id: string; title: string; questionIds: any; sentAt: string } | null;
  answerSet: { id: string; version: number; completedAt: string | null } | null;
  decidedBy: { name: string } | null;
}

export function RetakeRequestsCard() {
  const router = useRouter();
  const [requests, setRequests] = useState<RetakeReq[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [decisionDialog, setDecisionDialog] = useState<{ id: string; decision: "APPROVED" | "DENIED" } | null>(null);
  const [note, setNote] = useState("");

  async function load() {
    const res = await fetch("/api/retakes");
    const j = await res.json().catch(() => ({}));
    setRequests(j.requests ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  async function decide(id: string, decision: "APPROVED" | "DENIED", noteText: string) {
    setBusyId(id);
    const res = await fetch(`/api/retakes/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, note: noteText.trim() || undefined }),
    });
    setBusyId(null);
    setDecisionDialog(null);
    setNote("");
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Failed");
      return;
    }
    await load();
    router.refresh();
  }

  const pending = requests.filter((r) => r.status === "PENDING");
  if (loading || pending.length === 0) return null;

  return (
    <>
      <section className="card overflow-hidden mb-5 border-l-4 border-brand-orange">
        <header className="px-5 py-3 border-b border-ink-softLine bg-brand-orange/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-display font-semibold">Retake requests</span>
            <span className="badge-warning">{pending.length}</span>
          </div>
          <span className="meta">requires your decision</span>
        </header>
        <ul className="divide-y divide-ink-softLine">
          {pending.map((r) => (
            <li key={r.id} className="px-5 py-3 flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <span className="font-semibold">{r.requester.name}</span>
                  <span className="meta"> · {r.requester.role.toLowerCase().replace("_", " ")}</span>
                </div>
                <div className="text-sm text-ink-slate mt-0.5">
                  Wants to retake:{" "}
                  <span className="font-medium">
                    {r.adHocQuiz ? r.adHocQuiz.title : r.answerSet ? `Intake v${r.answerSet.version}` : "—"}
                  </span>
                </div>
                {r.reason && (
                  <div className="text-xs italic text-ink-muted mt-1 border-l-2 border-ink-softLine pl-2">
                    "{r.reason}"
                  </div>
                )}
                <div className="meta mt-1">submitted {new Date(r.createdAt).toLocaleDateString()}</div>
              </div>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setDecisionDialog({ id: r.id, decision: "APPROVED" })}
                  disabled={busyId === r.id}
                  className="btn-primary text-xs"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setDecisionDialog({ id: r.id, decision: "DENIED" })}
                  disabled={busyId === r.id}
                  className="btn-ghost text-xs text-brand-red"
                >
                  Deny
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {decisionDialog && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => setDecisionDialog(null)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none">
            <div className="card max-w-md w-full p-6 pointer-events-auto animate-slideUp">
              <h2 className="h-section">{decisionDialog.decision === "APPROVED" ? "Approve retake" : "Deny retake"}</h2>
              <p className="text-sm text-ink-muted mt-2 mb-4">
                {decisionDialog.decision === "APPROVED"
                  ? "Approving will create a fresh quiz and email the AE a new link (or unlock intake retake)."
                  : "The AE will be notified the request was not approved."}
              </p>
              <label className="label">Note for the AE (optional)</label>
              <textarea
                className="input min-h-[80px]"
                placeholder={decisionDialog.decision === "APPROVED" ? "e.g., Take your time and read carefully." : "e.g., Let's discuss in our 1:1 first."}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setDecisionDialog(null)} className="btn-ghost">Cancel</button>
                <button
                  onClick={() => decide(decisionDialog.id, decisionDialog.decision, note)}
                  disabled={busyId === decisionDialog.id}
                  className={decisionDialog.decision === "APPROVED" ? "btn-primary" : "btn-secondary text-brand-red"}
                >
                  {busyId === decisionDialog.id ? "Working…" : decisionDialog.decision === "APPROVED" ? "Approve & send" : "Deny"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
