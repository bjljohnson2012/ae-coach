"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserSearch } from "@/components/UserSearch";

export function TaskTools({
  aes,
  defaultAeId,
}: {
  aes: Array<{ id: string; name: string; hint?: string }>;
  defaultAeId: string | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<null | "manual" | "generate">(null);
  const [aeId, setAeId] = useState(defaultAeId ?? aes[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDays, setDueDays] = useState(7);
  const [dueMode, setDueMode] = useState<"relative" | "date">("relative");
  const [dueDate, setDueDate] = useState<string>("");
  const [count, setCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function describeWithAi() {
    if (!title || !aeId) return;
    setAiBusy(true);
    const res = await fetch("/api/tasks/describe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, aeProfileId: aeId }),
    });
    setAiBusy(false);
    if (!res.ok) return;
    const j = await res.json();
    if (j.description) setDescription(j.description);
  }

  async function manualSave() {
    setBusy(true); setError(null);
    let due: string | undefined;
    if (dueMode === "date" && dueDate) {
      due = new Date(dueDate).toISOString();
    } else {
      const d = new Date();
      d.setDate(d.getDate() + dueDays);
      due = d.toISOString();
    }
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aeProfileId: aeId,
        title,
        description: description || undefined,
        dueAt: due,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Failed");
      return;
    }
    setMode(null); setTitle(""); setDescription(""); setDueDate("");
    router.refresh();
  }

  async function aiGenerate() {
    setBusy(true); setError(null);
    const res = await fetch("/api/tasks/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aeProfileId: aeId, count }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Failed");
      return;
    }
    setMode(null);
    router.refresh();
  }

  function exportMd() {
    window.location.href = "/api/tasks/export?format=md";
  }

  return (
    <div className="flex gap-2">
      <button onClick={() => setMode("manual")} className="btn-secondary text-sm">+ Add Task</button>
      <button onClick={() => setMode("generate")} className="btn-primary text-sm">✨ Generate Tasks</button>
      <button onClick={exportMd} className="btn-ghost text-sm" title="Export current open tasks as Markdown">
        ⇣ Export
      </button>

      {mode && (
        <>
          <div className="fixed inset-0 bg-brand-navy/40 z-30" onClick={() => setMode(null)} />
          <div className="fixed inset-0 z-40 flex items-start justify-center p-6 pointer-events-none">
            <div className="card w-full max-w-md p-6 mt-20 pointer-events-auto animate-slideUp space-y-3">
              <h2 className="h-section">{mode === "manual" ? "Add Task" : "Generate Tasks with AI"}</h2>
              {aes.length > 1 && (
                <div>
                  <label className="label">For AE</label>
                  <UserSearch options={aes} value={aeId} onChange={setAeId} placeholder="Search by name…" />
                </div>
              )}
              {mode === "manual" && (
                <>
                  <div>
                    <label className="label">Title</label>
                    <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder='e.g. "Run two MEDDPICC discoveries this week"' />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="label !mb-0">Description</span>
                      <button
                        type="button"
                        onClick={describeWithAi}
                        disabled={!title || !aeId || aiBusy}
                        className="text-xs text-brand-indigo hover:underline disabled:text-ink-muted"
                      >
                        {aiBusy ? "Generating…" : "✨ Fill with AI from AE profile"}
                      </button>
                    </div>
                    <textarea className="input min-h-[100px]" value={description} onChange={(e) => setDescription(e.target.value)} />
                  </div>
                  <div>
                    <label className="label">Due</label>
                    <div className="flex gap-2 items-center mb-2">
                      <button
                        type="button"
                        onClick={() => setDueMode("relative")}
                        className={`px-2 py-1 rounded-brand text-xs font-semibold ${dueMode === "relative" ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 text-ink-slate"}`}
                      >In X days</button>
                      <button
                        type="button"
                        onClick={() => setDueMode("date")}
                        className={`px-2 py-1 rounded-brand text-xs font-semibold ${dueMode === "date" ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 text-ink-slate"}`}
                      >Pick a date</button>
                    </div>
                    {dueMode === "relative" ? (
                      <div className="flex items-center gap-3">
                        <input type="range" min={1} max={90} value={dueDays} onChange={(e) => setDueDays(Number(e.target.value))} className="flex-1" />
                        <span className="font-mono w-12 text-right">{dueDays}d</span>
                      </div>
                    ) : (
                      <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                    )}
                  </div>
                </>
              )}
              {mode === "generate" && (
                <>
                  <p className="text-sm text-ink-muted">
                    AI looks at the AE's skill scores, strengths, and weaknesses, then creates specific actions.
                    Avoids duplicating existing open tasks.
                  </p>
                  <div>
                    <label className="label">How many tasks?</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={1} max={10} value={count} onChange={(e) => setCount(Number(e.target.value))} className="flex-1" />
                      <span className="font-mono w-8 text-right">{count}</span>
                    </div>
                  </div>
                </>
              )}
              {error && <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">{error}</div>}
              <div className="flex gap-2 pt-2">
                {mode === "manual" ? (
                  <button onClick={manualSave} disabled={busy || !title} className="btn-primary">{busy ? "Saving…" : "Add task"}</button>
                ) : (
                  <button onClick={aiGenerate} disabled={busy || !aeId} className="btn-primary">{busy ? "Generating…" : "Generate"}</button>
                )}
                <button onClick={() => setMode(null)} className="btn-ghost">Cancel</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
