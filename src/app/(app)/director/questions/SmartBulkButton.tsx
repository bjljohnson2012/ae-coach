"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface Analysis {
  coverage: Record<string, number>;
  gaps: string[];
  recommendation: string;
}

interface DraftQ {
  text: string;
  questionType: "LONG_FORM" | "MULTIPLE_CHOICE" | "LIKERT" | "SLIDER";
  optionsJson?: any;
  tagsJson: string[];
  rationale?: string;
  selected: boolean;
}

const COVERAGE_PRESETS: Record<string, string[]> = {
  PERSONALITY: ["DISC:D", "DISC:I", "DISC:S", "DISC:C", "MBTI:E", "MBTI:I", "MBTI:S", "MBTI:N", "MBTI:T", "MBTI:F", "MBTI:J", "MBTI:P"],
  DISC: ["DISC:D", "DISC:I", "DISC:S", "DISC:C"],
  MBTI: ["MBTI:E", "MBTI:I", "MBTI:S", "MBTI:N", "MBTI:T", "MBTI:F", "MBTI:J", "MBTI:P"],
  ENNEAGRAM: ["ENNEAGRAM:1", "ENNEAGRAM:2", "ENNEAGRAM:3", "ENNEAGRAM:4", "ENNEAGRAM:5", "ENNEAGRAM:6", "ENNEAGRAM:7", "ENNEAGRAM:8", "ENNEAGRAM:9"],
  SALES_STYLE: ["DISCOVERY", "OBJECTION_HANDLING", "CLOSING"],
  COMMUNICATION: ["COMMUNICATION", "DISC:D", "DISC:I", "DISC:S", "DISC:C"],
  MOTIVATION: ["MOTIVATION:money", "MOTIVATION:mastery", "MOTIVATION:impact", "MOTIVATION:recognition", "MOTIVATION:team"],
  RESILIENCE: ["RESILIENCE", "OBJECTION_HANDLING"],
  LEADERSHIP: ["LEADERSHIP", "FORECASTING"],
  DIRECTOR_MONTHLY_REVIEW: ["DISCOVERY", "OBJECTION_HANDLING", "CLOSING", "PRODUCT_MASTERY", "RESILIENCE"],
};

export function SmartBulkButton({ category, prettyCategory }: { category: string; prettyCategory: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [count, setCount] = useState(20);
  const [styleHint, setStyleHint] = useState("");
  const [coverage, setCoverage] = useState<string[]>(COVERAGE_PRESETS[category] ?? []);
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [drafts, setDrafts] = useState<DraftQ[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function reset() {
    setStep(1);
    setCount(20);
    setStyleHint("");
    setCoverage(COVERAGE_PRESETS[category] ?? []);
    setBusy(false);
    setAnalysis(null);
    setDrafts([]);
    setError(null);
    setSaving(false);
  }

  function close() { setOpen(false); reset(); }

  async function generate() {
    setError(null);
    setBusy(true);
    const res = await fetch("/api/questions/bulk-smart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category,
        count,
        coverageTargets: coverage.length > 0 ? coverage : undefined,
        styleHint: styleHint.trim() || undefined,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Generation failed.");
      return;
    }
    const j = await res.json();
    setAnalysis(j.analysis ?? null);
    setDrafts((j.questions ?? []).map((q: any) => ({ ...q, selected: true })));
    setStep(3);
  }

  async function saveSelected() {
    const toSave = drafts.filter((d) => d.selected);
    if (toSave.length === 0) return;
    setSaving(true);
    let saved = 0;
    for (const d of toSave) {
      const res = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          questionType: d.questionType,
          text: d.text,
          optionsJson: d.optionsJson,
          tagsJson: d.tagsJson ?? [],
          aiGenerated: true,
        }),
      });
      if (res.ok) saved++;
    }
    setSaving(false);
    close();
    router.refresh();
    setTimeout(() => alert(`Saved ${saved} of ${toSave.length}.`), 0);
  }

  function toggleCoverage(t: string) {
    setCoverage((c) => c.includes(t) ? c.filter((x) => x !== t) : [...c, t]);
  }
  function toggleDraft(i: number) {
    setDrafts((arr) => arr.map((d, idx) => idx === i ? { ...d, selected: !d.selected } : d));
  }

  const presets = COVERAGE_PRESETS[category] ?? [];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-secondary text-xs whitespace-nowrap"
      >
        ✨ Add bulk
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={close} />
          <div className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
            <div className="card max-w-3xl w-full p-6 my-6 pointer-events-auto animate-slideUp max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="h-section">Bulk Generate — {prettyCategory}</h2>
                <button onClick={close} className="text-ink-muted hover:text-ink">✕</button>
              </div>

              {/* Step 1 — How many + style hint */}
              {step === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="label">How many questions?</label>
                    <div className="flex items-center gap-3">
                      <input type="range" min={5} max={100} step={5} value={count}
                        onChange={(e) => setCount(Number(e.target.value))} className="flex-1" />
                      <span className="font-mono w-10 text-right">{count}</span>
                    </div>
                    <div className="meta mt-1">Up to 100 per run.</div>
                  </div>
                  <div>
                    <label className="label">What kind of questions are you trying to ask?</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g., Sandler-style discovery, Challenger reframes, NEPQ pain questions, MEDDPICC qualifying…"
                      value={styleHint}
                      onChange={(e) => setStyleHint(e.target.value)}
                    />
                    <div className="meta mt-1">
                      Optional — give a methodology, framework, or angle. Leave blank to let the AI choose.
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={close} className="btn-ghost">Cancel</button>
                    <button onClick={() => setStep(2)} className="btn-primary">Next →</button>
                  </div>
                </div>
              )}

              {/* Step 2 — Coverage targets */}
              {step === 2 && (
                <div className="space-y-4">
                  <div>
                    <div className="eyebrow mb-1">Coverage targets</div>
                    <p className="text-sm text-ink-muted mb-3">
                      Select the personality dimensions or skills you want covered. We'll prioritize gaps in your existing bank for these tags.
                    </p>
                    {presets.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {presets.map((t) => {
                          const on = coverage.includes(t);
                          return (
                            <button key={t} type="button" onClick={() => toggleCoverage(t)}
                              className={`px-2.5 py-1.5 rounded-brand text-xs font-mono transition-colors ${
                                on ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 text-ink-slate hover:bg-ink-softLine"
                              }`}
                            >
                              {on && "✓ "}{t}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-sm text-ink-muted italic">No preset tags for this category. AI will pick coverage automatically.</div>
                    )}
                    <div className="meta mt-2">{coverage.length} selected.</div>
                  </div>
                  <div>
                    <label className="label">Custom tags (comma-separated)</label>
                    <input
                      type="text"
                      className="input font-mono text-sm"
                      placeholder="e.g., DISCOVERY, FORECASTING, MOTIVATION:autonomy"
                      onBlur={(e) => {
                        const extra = e.target.value.split(",").map((s) => s.trim()).filter(Boolean);
                        if (extra.length > 0) {
                          setCoverage((c) => Array.from(new Set([...c, ...extra])));
                          e.target.value = "";
                        }
                      }}
                    />
                  </div>
                  <div className="flex justify-between pt-2">
                    <button onClick={() => setStep(1)} className="btn-ghost">← Back</button>
                    <div className="flex gap-2">
                      <button onClick={close} className="btn-ghost">Cancel</button>
                      <button onClick={generate} disabled={busy} className="btn-primary">
                        {busy ? "Generating…" : `Generate ${count} questions`}
                      </button>
                    </div>
                  </div>
                  {error && <div className="text-sm text-brand-red">{error}</div>}
                </div>
              )}

              {/* Step 3 — Review drafts */}
              {step === 3 && (
                <div className="space-y-4">
                  {analysis && (
                    <div className="card p-4 bg-brand-indigo/5 border-l-4 border-brand-indigo">
                      <div className="eyebrow mb-1">Coverage analysis</div>
                      <p className="text-sm">{analysis.recommendation}</p>
                      {analysis.gaps?.length > 0 && (
                        <div className="text-xs mt-2">
                          <span className="font-semibold">Gaps targeted: </span>
                          {analysis.gaps.map((g) => <span key={g} className="font-mono mr-1.5">{g}</span>)}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <div className="text-sm">
                      <span className="font-mono font-bold">{drafts.filter((d) => d.selected).length}</span>
                      <span className="text-ink-muted"> / {drafts.length} selected</span>
                    </div>
                    <button onClick={() => setDrafts((arr) => arr.map((d) => ({ ...d, selected: !d.selected })))} className="text-xs link">
                      Toggle all
                    </button>
                  </div>
                  <ul className="divide-y divide-ink-softLine border border-ink-softLine rounded-brand max-h-[50vh] overflow-y-auto">
                    {drafts.map((d, i) => (
                      <li key={i} className="px-3 py-2.5 flex items-start gap-3">
                        <input type="checkbox" checked={d.selected} onChange={() => toggleDraft(i)} className="mt-1" />
                        <div className="flex-1 text-sm">
                          <div className="font-medium">{d.text}</div>
                          <div className="meta mt-0.5">
                            {d.questionType.toLowerCase().replace("_", " ")}
                            {d.tagsJson && d.tagsJson.length > 0 && (
                              <> · <span className="font-mono">{d.tagsJson.join(", ")}</span></>
                            )}
                          </div>
                          {d.rationale && <div className="meta italic mt-0.5">{d.rationale}</div>}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex justify-between gap-2 pt-2">
                    <button onClick={() => setStep(2)} className="btn-ghost">← Back</button>
                    <div className="flex gap-2">
                      <button onClick={close} className="btn-ghost">Cancel</button>
                      <button
                        onClick={saveSelected}
                        disabled={saving || drafts.filter((d) => d.selected).length === 0}
                        className="btn-primary"
                      >
                        {saving ? "Saving…" : `Save ${drafts.filter((d) => d.selected).length} questions`}
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
