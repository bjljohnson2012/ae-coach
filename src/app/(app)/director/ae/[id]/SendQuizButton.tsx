"use client";
import { useState } from "react";

interface PreviewQuestion {
  id: string;
  text: string;
  questionType: string;
  category: string;
}

const FOCUS_OPTIONS: Array<{ value: string; label: string; group: string }> = [
  { group: "Skill",       value: "DISCOVERY",          label: "Discovery" },
  { group: "Skill",       value: "OBJECTION_HANDLING", label: "Objection handling" },
  { group: "Skill",       value: "CLOSING",            label: "Closing" },
  { group: "Skill",       value: "COMMUNICATION",      label: "Communication" },
  { group: "Skill",       value: "RESILIENCE",         label: "Resilience" },
  { group: "Skill",       value: "PRODUCT_MASTERY",    label: "Product mastery" },
  { group: "Personality", value: "DISC:D",             label: "DISC D" },
  { group: "Personality", value: "DISC:I",             label: "DISC I" },
  { group: "Personality", value: "DISC:S",             label: "DISC S" },
  { group: "Personality", value: "DISC:C",             label: "DISC C" },
  { group: "Personality", value: "MBTI:E",             label: "MBTI E" },
  { group: "Personality", value: "MBTI:I",             label: "MBTI I" },
];

export function SendQuizButton({ aeProfileId, aeName, kind = "ae" }: { aeProfileId: string; aeName: string; kind?: "ae" | "director" }) {
  const apiBase = kind === "ae" ? `/api/ae/${aeProfileId}/send-quiz` : `/api/director/${aeProfileId}/send-quiz`;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [count, setCount] = useState(8);
  const [focus, setFocus] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(14);
  const [questions, setQuestions] = useState<PreviewQuestion[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ tokenLink: string; expiresAt: string; emailVia: string } | null>(null);

  function close() {
    setOpen(false);
    setStep(1);
    setQuestions([]);
    setSelected({});
    setBusy(false);
    setError(null);
    setDone(null);
    setTitle("");
    setDescription("");
    setFocus([]);
    setCount(8);
    setExpiresInDays(14);
  }

  function toggleFocus(v: string) {
    setFocus((f) => f.includes(v) ? f.filter((x) => x !== v) : [...f, v]);
  }

  async function preview() {
    setBusy(true); setError(null);
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "preview", count, focusAreas: focus }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Preview failed.");
      return;
    }
    const j = await res.json();
    const qs: PreviewQuestion[] = j.questions ?? [];
    setQuestions(qs);
    const sel: Record<string, boolean> = {};
    qs.forEach((q) => { sel[q.id] = true; });
    setSelected(sel);
    if (!title) {
      const focusLabel = focus.length > 0 ? focus.map((f) => f.replace(/_/g, " ").toLowerCase()).join(", ") : "skill check-in";
      setTitle(`${aeName.split(" ")[0]} — ${focusLabel}`);
    }
    setStep(3);
  }

  async function send() {
    const ids = questions.filter((q) => selected[q.id]).map((q) => q.id);
    if (ids.length === 0) { setError("Select at least one question."); return; }
    setBusy(true); setError(null);
    const res = await fetch(apiBase, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "send",
        title: title.trim() || `Quick check-in for ${aeName.split(" ")[0]}`,
        description: description.trim() || undefined,
        kind: "SKILL_CHECK_IN",
        questionIds: ids,
        focusAreas: focus,
        expiresInDays,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Send failed.");
      return;
    }
    const j = await res.json();
    setDone({
      tokenLink: j.tokenLink,
      expiresAt: j.expiresAt,
      emailVia: j.email?.via || "console",
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn-secondary text-xs">
        ✉️ Send quiz
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={close} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
            <div className="card max-w-2xl w-full p-6 my-6 pointer-events-auto animate-slideUp max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <h2 className="h-section">Send quiz to {aeName}</h2>
                <button onClick={close} className="text-ink-muted hover:text-ink">✕</button>
              </div>

              {done ? (
                <div className="space-y-3">
                  <div className="card p-5 bg-brand-emerald/5 border border-brand-emerald/30 text-center">
                    <div className="text-3xl mb-2">✓</div>
                    <div className="font-display font-bold text-lg">Quiz sent</div>
                    <p className="text-sm text-ink-muted mt-1">
                      Email sent via {done.emailVia}. Link expires {new Date(done.expiresAt).toLocaleDateString()}.
                    </p>
                  </div>
                  <div className="card p-3">
                    <div className="meta mb-1">Direct link (in case email gets stuck):</div>
                    <code className="text-xs break-all">{done.tokenLink}</code>
                  </div>
                  <div className="flex justify-end">
                    <button onClick={close} className="btn-primary">Done</button>
                  </div>
                </div>
              ) : step === 1 ? (
                <div className="space-y-4">
                  <p className="text-sm text-ink-muted">
                    AI will pick questions targeting the focus areas you select, biased toward {aeName}'s
                    weakest skills. You'll review the picks before sending.
                  </p>
                  <div>
                    <label className="label">Focus areas <span className="meta">(optional — default: weakest skills)</span></label>
                    <div className="space-y-2">
                      {(["Skill", "Personality"] as const).map((group) => (
                        <div key={group}>
                          <div className="meta mb-1">{group}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {FOCUS_OPTIONS.filter((o) => o.group === group).map((o) => {
                              const on = focus.includes(o.value);
                              return (
                                <button
                                  key={o.value}
                                  type="button"
                                  onClick={() => toggleFocus(o.value)}
                                  className={`px-2.5 py-1 rounded-brand text-xs font-semibold transition-colors ${
                                    on ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 hover:bg-ink-softLine"
                                  }`}
                                >
                                  {on && "✓ "}{o.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="label">How many questions?</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={3} max={25} value={count} onChange={(e) => setCount(Number(e.target.value))} className="flex-1" />
                      <span className="font-mono w-8 text-right">{count}</span>
                    </div>
                    <div className="meta mt-1">~{Math.max(2, Math.round(count * 0.3))} minutes for the recipient.</div>
                  </div>
                  {error && <div className="text-sm text-brand-red">{error}</div>}
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={close} className="btn-ghost">Cancel</button>
                    <button onClick={preview} disabled={busy} className="btn-primary">
                      {busy ? "Picking questions…" : "Pick questions →"}
                    </button>
                  </div>
                </div>
              ) : step === 3 ? (
                <div className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">Quiz title (visible to recipient)</label>
                      <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
                    </div>
                    <div>
                      <label className="label">Expires in (days)</label>
                      <input type="number" className="input" min={1} max={60} value={expiresInDays} onChange={(e) => setExpiresInDays(Number(e.target.value) || 14)} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Note to recipient (optional)</label>
                    <textarea className="input min-h-[60px]" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A line of context they'll see when they open the email." />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="eyebrow">Questions ({Object.values(selected).filter(Boolean).length}/{questions.length} selected)</div>
                      <button onClick={() => {
                        const allOn = Object.values(selected).every(Boolean);
                        const next: Record<string, boolean> = {};
                        questions.forEach((q) => { next[q.id] = !allOn; });
                        setSelected(next);
                      }} className="text-xs link">Toggle all</button>
                    </div>
                    <ul className="divide-y divide-ink-softLine border border-ink-softLine rounded-brand max-h-[40vh] overflow-y-auto">
                      {questions.map((q) => (
                        <li key={q.id} className="px-3 py-2 flex items-start gap-3">
                          <input type="checkbox" checked={!!selected[q.id]} onChange={() => setSelected((s) => ({ ...s, [q.id]: !s[q.id] }))} className="mt-1" />
                          <div className="flex-1 text-sm">
                            <div className="font-medium">{q.text}</div>
                            <div className="meta">{q.category.replace(/_/g, " ").toLowerCase()} · {q.questionType.toLowerCase().replace("_", " ")}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {error && <div className="text-sm text-brand-red">{error}</div>}
                  <div className="flex justify-between pt-2">
                    <button onClick={() => setStep(1)} className="btn-ghost">← Re-pick</button>
                    <div className="flex gap-2">
                      <button onClick={close} className="btn-ghost">Cancel</button>
                      <button onClick={send} disabled={busy || Object.values(selected).filter(Boolean).length === 0} className="btn-primary">
                        {busy ? "Sending…" : `Send ${Object.values(selected).filter(Boolean).length} questions`}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </>
      )}
    </>
  );
}
