"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { WizardStep } from "@/components/WizardStep";

interface WizardQuestion {
  id: string;
  category: string;
  questionType: "LONG_FORM" | "MULTIPLE_CHOICE" | "LIKERT" | "SLIDER";
  text: string;
  optionsJson: any;
}

interface SaturationStatus {
  mayFinish: boolean;
  coverage: number;
  answeredCount: number;
  estMinutesLow: number;
  estMinutesHigh: number;
  targetTotal: number;
  saturated: string[];
}

export function DirectorIntakeWizardClient({ directorName }: { directorName: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [answerSetId, setAnswerSetId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<WizardQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [idx, setIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saturation, setSaturation] = useState<SaturationStatus | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/director-intake/start", { method: "POST" });
      if (!res.ok) {
        setError("Could not start leadership intake.");
        setLoaded(true);
        return;
      }
      const j = await res.json();
      setAnswerSetId(j.answerSetId);
      setQuestions(j.questions);
      setAnswers(j.answers);
      setIdx(j.resumeIndex);
      setSaturation(j.saturation ?? null);
      setLoaded(true);
    })();
  }, []);

  if (!loaded) return <div className="p-8">Loading your leadership intake…</div>;
  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (questions.length === 0) {
    return (
      <div className="p-8">
        No leadership/personality questions configured. Author them in <code>/director/questions/new</code> with a director category.
      </div>
    );
  }

  const q = questions[idx];
  const target = saturation?.targetTotal ?? questions.length;
  const progress = Math.round(((idx + 1) / target) * 100);
  const current = answers[q.id];
  const canAdvance = !!current;

  async function persistAnswer(newIdx: number, val: any) {
    if (!answerSetId) return;
    setSaving(true);
    const res = await fetch("/api/director-intake/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerSetId, questionId: q.id, value: val, resumeIndex: newIdx }),
    }).finally(() => setSaving(false));
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      if (j.saturation) setSaturation(j.saturation);
    }
  }

  async function next() {
    await persistAnswer(idx + 1, current);
    setIdx((i) => i + 1);
  }

  async function back() {
    setIdx((i) => Math.max(0, i - 1));
  }

  async function submit() {
    // v3.37.5 — async submit. Endpoint flips status to GENERATING and
    // returns in milliseconds; the AI work runs in the background. The user
    // sees the dashboard banner ("Generating your profile…") immediately
    // instead of staring at the form.
    setSubmitting(true);
    setError(null);
    await persistAnswer(idx, current);
    const res = await fetch("/api/director-intake/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerSetId }),
    });
    if (!res.ok) {
      setSubmitting(false);
      setError((await res.json().catch(() => ({}))).error || "Submission failed.");
      return;
    }
    // Skip setSubmitting(false) — we're navigating away. Dashboard banner
    // takes over the "generating" UX.
    router.push("/dashboard");
    router.refresh();
  }

  const timeEstStr = saturation
    ? saturation.estMinutesLow === saturation.estMinutesHigh
      ? `~${saturation.estMinutesLow} min left`
      : `~${saturation.estMinutesLow}–${saturation.estMinutesHigh} min left`
    : null;
  const showFinishEarly = saturation?.mayFinish && idx < questions.length - 1;
  const isLast = idx >= questions.length - 1;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="h-1 bg-neutral-200">
        <div className="h-full bg-accent2 transition-all" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="card w-full max-w-2xl p-8">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Leadership intake · Question {idx + 1} of {target}
            </span>
            <span className="text-xs text-neutral-500">
              Hi, {directorName.split(" ")[0]} · {saving ? "saving…" : "auto-saved"}
            </span>
          </div>

          {timeEstStr && (
            <div className="mb-4 text-xs text-ink-muted flex items-center gap-3">
              <span>⏱ {timeEstStr}</span>
              {saturation && saturation.coverage > 0 && (
                <span>· {Math.round(saturation.coverage * 100)}% profile coverage</span>
              )}
            </div>
          )}

          <WizardStep
            question={q as any}
            value={current}
            onChange={(v) => setAnswers({ ...answers, [q.id]: v })}
          />

          {showFinishEarly && (
            <div className="mt-6 p-4 rounded-brand bg-brand-emerald/5 border border-brand-emerald/30 text-sm">
              <div className="font-semibold text-brand-emerald mb-1">✓ You have enough signal to finish — but more answers will sharpen the read</div>
              <p className="text-ink-slate text-xs">
                The AI has a confident take on your leadership style and personality right now. Stop here for a solid baseline,
                or keep going — every additional question makes the profile more accurate, especially on the edges.
              </p>
              <button
                type="button"
                disabled={submitting}
                onClick={submit}
                className="btn-primary text-xs mt-3"
              >
                {submitting ? "Generating your director profile…" : "Finish here & build my profile"}
              </button>
            </div>
          )}

          {error && <div className="text-sm text-red-600 mt-4">{error}</div>}

          <div className="flex justify-between mt-8 gap-3 flex-wrap">
            <button type="button" className="btn-secondary" disabled={idx === 0} onClick={back}>
              ← Back
            </button>
            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => persistAnswer(idx, current).then(() => router.push("/dashboard"))}
              >
                Save & finish later
              </button>
              {!isLast && (
                <button type="button" className="btn-primary" disabled={!canAdvance} onClick={next}>
                  Next →
                </button>
              )}
              {/* v3.37.4 — once saturated, Submit lives in the row alongside
                  Next so the user has a one-click path to finish without
                  scrolling up to the inline callout. On the last question we
                  show only Submit (no Next, since there's nothing after). */}
              {(saturation?.mayFinish || isLast) && (
                <button
                  type="button"
                  className="btn-accent"
                  disabled={!canAdvance || submitting}
                  onClick={submit}
                >
                  {submitting
                    ? "Generating your director profile…"
                    : isLast
                      ? "Finish & build my profile"
                      : "Submit"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
