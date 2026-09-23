"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface DraftTask {
  title: string;
  description: string;
  urgency: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  category: "SALES_SKILL" | "PRODUCT_KNOWLEDGE" | "PERSONALITY" | "GENERAL";
  dueInDays: number;
  rationale: string;
  selected: boolean;
}

const URGENCY_COLOR: Record<string, string> = {
  URGENT: "bg-brand-red/10 text-brand-red",
  HIGH: "bg-brand-orange/10 text-brand-orange",
  MEDIUM: "bg-brand-indigo/10 text-brand-indigo",
  LOW: "bg-ink-softLine text-ink-slate",
};

export function GenerateTasksButton({ aeProfileId, aeName }: { aeProfileId: string; aeName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [count, setCount] = useState(5);
  const [drafts, setDrafts] = useState<DraftTask[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setDrafts([]);
    setError(null);
  }

  async function generate() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/ae/${aeProfileId}/generate-tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Generation failed.");
      return;
    }
    const j = await res.json();
    setDrafts((j.draft ?? []).map((d: any) => ({ ...d, selected: true })));
  }

  function toggle(i: number) {
    setDrafts((arr) => arr.map((d, idx) => idx === i ? { ...d, selected: !d.selected } : d));
  }

  async function saveSelected() {
    const toSave = drafts.filter((d) => d.selected);
    if (toSave.length === 0) return;
    setSaving(true);
    let saved = 0;
    for (const d of toSave) {
      const dueAt = new Date(Date.now() + (d.dueInDays || 0) * 24 * 3600 * 1000).toISOString();
      const res = await fetch(`/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aeProfileId,
          title: d.title,
          description: d.description,
          dueAt,
        }),
      });
      if (res.ok) saved++;
    }
    setSaving(false);
    close();
    router.refresh();
    setTimeout(() => alert(`Saved ${saved} of ${toSave.length} tasks.`), 0);
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-xs">
        ✨ Generate tasks
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={close} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
            <div className="card max-w-2xl w-full p-6 my-6 pointer-events-auto animate-slideUp max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h2 className="h-section">Generate tasks for {aeName}</h2>
                <button onClick={close} className="text-ink-muted hover:text-ink">✕</button>
              </div>

              {drafts.length === 0 ? (
                <div className="space-y-4">
                  <p className="text-sm text-ink-muted">
                    AI will look at {aeName}'s skill scores, weaknesses, and existing open tasks, then propose
                    next-best actions ranked by urgency.
                  </p>
                  <div>
                    <label className="label">How many tasks?</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} className="flex-1" />
                      <span className="font-mono w-8 text-right">{count}</span>
                    </div>
                  </div>
                  {error && <div className="text-sm text-brand-red">{error}</div>}
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={close} className="btn-ghost">Cancel</button>
                    <button onClick={generate} disabled={busy} className="btn-primary">
                      {busy ? "Generating…" : `Generate ${count}`}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-mono font-bold">{drafts.filter((d) => d.selected).length}</span>
                      <span className="text-ink-muted"> / {drafts.length} selected</span>
                    </div>
                    <button onClick={() => setDrafts((arr) => arr.map((d) => ({ ...d, selected: !d.selected })))} className="text-xs link">
                      Toggle all
                    </button>
                  </div>
                  <ul className="divide-y divide-ink-softLine border border-ink-softLine rounded-brand max-h-[55vh] overflow-y-auto">
                    {drafts.map((d, i) => (
                      <li key={i} className="px-3 py-3 flex items-start gap-3">
                        <input type="checkbox" checked={d.selected} onChange={() => toggle(i)} className="mt-1" />
                        <div className="flex-1 text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{d.title}</span>
                            <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${URGENCY_COLOR[d.urgency]}`}>
                              {d.urgency}
                            </span>
                            <span className="meta">due in {d.dueInDays}d · {d.category.replace(/_/g, " ").toLowerCase()}</span>
                          </div>
                          <p className="text-ink-slate mt-1">{d.description}</p>
                          {d.rationale && <p className="meta italic mt-1">{d.rationale}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between pt-2">
                    <button onClick={() => setDrafts([])} className="btn-ghost">← Regenerate</button>
                    <div className="flex gap-2">
                      <button onClick={close} className="btn-ghost">Cancel</button>
                      <button onClick={saveSelected} disabled={saving || drafts.filter((d) => d.selected).length === 0} className="btn-primary">
                        {saving ? "Saving…" : `Save ${drafts.filter((d) => d.selected).length} task${drafts.filter((d) => d.selected).length === 1 ? "" : "s"}`}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
