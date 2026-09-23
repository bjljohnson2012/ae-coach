"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserSearch } from "@/components/UserSearch";

export function NewReviewButton({ aes }: { aes: Array<{ id: string; name: string; hint?: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [aeProfileId, setAeProfileId] = useState(aes[0]?.id ?? "");
  const [kind, setKind] = useState<"MONTHLY" | "AD_HOC">("AD_HOC");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true); setError(null);
    const res = await fetch("/api/director-review/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aeProfileId, kind, title: title || undefined }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Failed.");
      return;
    }
    const j = await res.json();
    router.push(`/director/reviews/${j.review.id}`);
  }

  if (!open) return <button onClick={() => setOpen(true)} className="btn-primary">+ New Review</button>;

  return (
    <>
      <div className="fixed inset-0 bg-brand-navy/40 z-30" onClick={() => setOpen(false)} />
      <div className="fixed inset-0 z-40 flex items-start justify-center p-6 pointer-events-none">
        <div className="card w-full max-w-md p-6 mt-20 pointer-events-auto animate-slideUp">
          <h2 className="h-section mb-1">New Review</h2>
          <p className="text-sm text-ink-muted mb-4">
            Pick the AE and whether this is monthly cadence or an ad-hoc coaching review.
          </p>
          <div className="space-y-3">
            <div>
              <label className="label">AE</label>
              <UserSearch options={aes} value={aeProfileId} onChange={setAeProfileId} placeholder="Search by name…" />
            </div>
            <div>
              <label className="label">Type</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setKind("AD_HOC")}
                  className={`flex-1 px-3 py-2 rounded-brand text-sm font-semibold transition-colors ${
                    kind === "AD_HOC" ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 text-ink-slate"
                  }`}
                >
                  Ad-hoc
                </button>
                <button
                  onClick={() => setKind("MONTHLY")}
                  className={`flex-1 px-3 py-2 rounded-brand text-sm font-semibold transition-colors ${
                    kind === "MONTHLY" ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 text-ink-slate"
                  }`}
                >
                  Monthly
                </button>
              </div>
            </div>
            {kind === "AD_HOC" && (
              <div>
                <label className="label">Title (optional — e.g., "Post-call debrief 5/4")</label>
                <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
            )}
            {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={saving || !aeProfileId} className="btn-primary">
                {saving ? "Creating…" : "Create review"}
              </button>
              <button onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
