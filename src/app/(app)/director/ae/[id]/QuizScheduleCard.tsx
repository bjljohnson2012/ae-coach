"use client";
import { useEffect, useState } from "react";

const CADENCE_LABELS: Record<string, string> = {
  WEEKLY: "Every week",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Every month",
  QUARTERLY: "Every quarter",
};

const FOCUS_OPTIONS: Array<{ value: string; label: string; group: string }> = [
  { group: "Skill",       value: "DISCOVERY",          label: "Discovery" },
  { group: "Skill",       value: "OBJECTION_HANDLING", label: "Objection handling" },
  { group: "Skill",       value: "CLOSING",            label: "Closing" },
  { group: "Skill",       value: "COMMUNICATION",      label: "Communication" },
  { group: "Skill",       value: "RESILIENCE",         label: "Resilience" },
  { group: "Skill",       value: "PRODUCT_MASTERY",    label: "Product mastery" },
  { group: "Skill",       value: "LEADERSHIP",         label: "Leadership" },
  { group: "Skill",       value: "FORECASTING",        label: "Forecasting" },
  { group: "Personality", value: "DISC:D",             label: "DISC D" },
  { group: "Personality", value: "DISC:I",             label: "DISC I" },
  { group: "Personality", value: "DISC:S",             label: "DISC S" },
  { group: "Personality", value: "DISC:C",             label: "DISC C" },
];

interface Schedule {
  id: string;
  active: boolean;
  cadence: string;
  questionsPerQuiz: number;
  focusAreas: string[];
  expiresAfterDays: number;
  notesToRecipient: string | null;
  titleTemplate: string | null;
  nextRunAt: string;
  lastRunAt: string | null;
  createdBy: { name: string };
}

function relTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const days = Math.round((d.getTime() - Date.now()) / (24 * 3600 * 1000));
  if (days < -1) return `${-days} days ago`;
  if (days < 0) return "yesterday";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return `in ${days} days`;
  if (days < 30) return `in ${Math.round(days / 7)} weeks`;
  return d.toLocaleDateString();
}

export function QuizScheduleCard({ aeProfileId, name, kind = "ae" }: { aeProfileId: string; name: string; kind?: "ae" | "director" }) {
  const apiBase = kind === "ae" ? `/api/ae/${aeProfileId}/quiz-schedule` : `/api/director/${aeProfileId}/quiz-schedule`;
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Form state
  const [active, setActive] = useState(true);
  const [cadence, setCadence] = useState("MONTHLY");
  // Default 12 — sweet spot in the 10–15 range. Long enough to catch skill
  // drift, short enough to keep recipients engaged with the recurring pulse.
  const [count, setCount] = useState(12);
  const [focus, setFocus] = useState<string[]>([]);
  const [expires, setExpires] = useState(14);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { void load(); }, [aeProfileId]);

  async function load() {
    setLoading(true);
    const res = await fetch(apiBase);
    const j = await res.json().catch(() => ({}));
    setSchedule(j.schedule ?? null);
    setLoading(false);
  }

  function openEditor() {
    if (schedule) {
      setActive(schedule.active);
      setCadence(schedule.cadence);
      setCount(schedule.questionsPerQuiz);
      setFocus(schedule.focusAreas ?? []);
      setExpires(schedule.expiresAfterDays);
      setNotes(schedule.notesToRecipient ?? "");
    } else {
      setActive(true);
      setCadence("MONTHLY");
      setCount(12);
      setFocus([]);
      setExpires(14);
      setNotes("");
    }
    setError(null);
    setOpen(true);
  }

  async function save() {
    setBusy(true); setError(null);
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        active,
        cadence,
        questionsPerQuiz: count,
        focusAreas: focus,
        expiresAfterDays: expires,
        notesToRecipient: notes.trim() || null,
        // Only set firstRunAt if creating fresh — POST without it preserves nextRunAt for edits
        ...(schedule ? {} : { firstRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() }),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Save failed");
      return;
    }
    setOpen(false);
    await load();
  }

  async function turnOff() {
    if (!confirm("Pause recurring quizzes for this profile? Future quizzes won't send. You can turn it back on anytime.")) return;
    await fetch(apiBase, { method: "DELETE" });
    await load();
  }

  async function actionSchedule(action: "skip" | "sendNow") {
    const verb = action === "skip" ? "skip the next send" : "send the next quiz now";
    if (!confirm(`Are you sure you want to ${verb}?`)) return;
    const res = await fetch(`${apiBase}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Action failed");
      return;
    }
    await load();
  }

  function toggleFocus(v: string) {
    setFocus((f) => f.includes(v) ? f.filter((x) => x !== v) : [...f, v]);
  }

  if (loading) {
    return <div className="card p-4 text-sm text-ink-muted">Loading schedule…</div>;
  }

  return (
    <>
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="eyebrow">Recurring quizzes</div>
          {schedule?.active ? (
            <span className="badge-success">On</span>
          ) : schedule ? (
            <span className="badge-neutral">Paused</span>
          ) : (
            <span className="badge-neutral">Off</span>
          )}
        </div>

        {!schedule || !schedule.active ? (
          <div>
            <p className="text-sm text-ink-muted mb-3">
              {schedule
                ? `Paused. Last sent ${relTime(schedule.lastRunAt)}.`
                : "Send automatic check-ins on a cadence. AI tailors each quiz to where they need to improve."}
            </p>
            <button onClick={openEditor} className="btn-primary text-sm">
              {schedule ? "Resume scheduling" : "Set up recurring quizzes"}
            </button>
          </div>
        ) : (
          <div>
            <ul className="text-sm space-y-1.5 mb-3">
              <li className="flex justify-between gap-3">
                <span className="text-ink-muted">Cadence</span>
                <span className="font-semibold">{CADENCE_LABELS[schedule.cadence] ?? schedule.cadence}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-ink-muted">Questions per quiz</span>
                <span className="font-mono">{schedule.questionsPerQuiz}</span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-ink-muted">Focus</span>
                <span className="text-right">
                  {schedule.focusAreas.length === 0
                    ? <em className="text-ink-muted">auto (weakest skills)</em>
                    : <span className="font-mono">{schedule.focusAreas.join(", ")}</span>}
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span className="text-ink-muted">Next send</span>
                <span className="font-semibold text-brand-indigo">{relTime(schedule.nextRunAt)}</span>
              </li>
              {schedule.lastRunAt && (
                <li className="flex justify-between gap-3">
                  <span className="text-ink-muted">Last sent</span>
                  <span>{relTime(schedule.lastRunAt)}</span>
                </li>
              )}
            </ul>
            <div className="flex gap-2 flex-wrap">
              <button onClick={() => actionSchedule("sendNow")} className="btn-primary text-xs">⚡ Send now</button>
              <button onClick={() => actionSchedule("skip")} className="btn-secondary text-xs">⏭ Skip next</button>
              <button onClick={openEditor} className="btn-ghost text-xs">Edit</button>
              <button onClick={turnOff} className="btn-ghost text-xs">Pause</button>
            </div>
          </div>
        )}
      </div>

      {open && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => setOpen(false)} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
            <div className="card max-w-xl w-full p-6 my-6 pointer-events-auto animate-slideUp max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h2 className="h-section">Recurring quiz schedule — {name}</h2>
                <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink">✕</button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label">Cadence</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY"] as const).map((c) => (
                      <button key={c} type="button" onClick={() => setCadence(c)}
                        className={`px-3 py-2 rounded-brand text-xs font-semibold transition-colors ${
                          cadence === c ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 hover:bg-ink-softLine"
                        }`}>
                        {CADENCE_LABELS[c]}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="label">Focus areas <span className="meta">(empty = auto-pick weakest skills each run)</span></label>
                  <div className="space-y-2">
                    {(["Skill", "Personality"] as const).map((group) => (
                      <div key={group}>
                        <div className="meta mb-1">{group}</div>
                        <div className="flex flex-wrap gap-1.5">
                          {FOCUS_OPTIONS.filter((o) => o.group === group).map((o) => {
                            const on = focus.includes(o.value);
                            return (
                              <button key={o.value} type="button" onClick={() => toggleFocus(o.value)}
                                className={`px-2.5 py-1 rounded-brand text-xs font-semibold transition-colors ${
                                  on ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 hover:bg-ink-softLine"
                                }`}>
                                {on && "✓ "}{o.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Questions per quiz</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={3} max={25} value={count} onChange={(e) => setCount(Number(e.target.value))} className="flex-1" />
                      <span className="font-mono w-8 text-right">{count}</span>
                    </div>
                    <div className="meta mt-1">~{Math.max(2, Math.round(count * 0.3))} minutes for the recipient.</div>
                  </div>
                  <div>
                    <label className="label">Expires after (days)</label>
                    <input type="number" className="input" min={1} max={60} value={expires} onChange={(e) => setExpires(Number(e.target.value) || 14)} />
                  </div>
                </div>

                <div>
                  <label className="label">Note to recipient (optional)</label>
                  <textarea className="input min-h-[60px]" value={notes} onChange={(e) => setNotes(e.target.value)}
                    placeholder="Quick context they'll see in every email." />
                </div>

                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                  Active — start sending on schedule
                </label>

                {error && <div className="text-sm text-brand-red">{error}</div>}

                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setOpen(false)} className="btn-ghost">Cancel</button>
                  <button onClick={save} disabled={busy} className="btn-primary">
                    {busy ? "Saving…" : (schedule ? "Save changes" : "Turn on")}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
