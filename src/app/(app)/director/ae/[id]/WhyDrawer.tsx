"use client";
import { useEffect, useState } from "react";

interface WhyAnswer {
  questionId: string;
  questionText: string;
  questionType: string;
  questionTags: string[];
  answerValue: any;
  optionLabel: string | null;
  optionTags: string[];
  matchedTags: string[];
}

interface WhyData {
  aeName: string;
  summary: any;
  answers: WhyAnswer[];
  answerSetCompletedAt: string | null;
  context: any;
}

export function WhyDrawer({
  aeProfileId,
  open,
  kind,
  value,
  label,
  onClose,
}: {
  aeProfileId: string;
  open: boolean;
  kind: "skill" | "personality";
  value: string;
  label: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<WhyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !value) return;
    setLoading(true);
    setData(null);
    setError(null);
    fetch(`/api/ae/${aeProfileId}/why?kind=${encodeURIComponent(kind)}&value=${encodeURIComponent(value)}`)
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Failed");
        }
        return res.json();
      })
      .then((j: WhyData) => setData(j))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, value, kind, aeProfileId]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-xl bg-white border-l border-ink-softLine shadow-cardHover overflow-y-auto animate-slideUp">
        <header className="sticky top-0 bg-white border-b border-ink-softLine px-5 py-3 flex items-center justify-between z-10">
          <div>
            <div className="eyebrow">Why {label}?</div>
            <div className="meta mt-0.5">
              {data?.aeName ?? "—"}
              {data?.answerSetCompletedAt && (
                <> · last intake {new Date(data.answerSetCompletedAt).toLocaleDateString()}</>
              )}
            </div>
          </div>
          <button onClick={onClose} className="text-ink-muted hover:text-ink text-lg" aria-label="Close">✕</button>
        </header>

        <div className="px-5 py-4 space-y-4">
          {loading && <div className="text-sm text-ink-muted">Loading…</div>}
          {error && <div className="text-sm text-brand-red">{error}</div>}

          {data && (
            <>
              {/* Summary card */}
              {kind === "skill" && (
                <div className="card p-4">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <div className="eyebrow">Score</div>
                      <div className="font-display text-2xl font-bold mt-1">{data.summary.score ?? "—"}</div>
                    </div>
                    <div>
                      <div className="eyebrow">Level</div>
                      <div className="font-display text-2xl font-bold mt-1">{data.summary.level ?? "—"}</div>
                    </div>
                    <div>
                      <div className="eyebrow">Source</div>
                      <div className="font-mono text-sm mt-2">{data.summary.source ?? "—"}</div>
                    </div>
                  </div>
                  {data.summary.notes && (
                    <div className="mt-3 pt-3 border-t border-ink-softLine text-sm">{data.summary.notes}</div>
                  )}
                </div>
              )}

              {kind === "personality" && (
                <div className="card p-4">
                  <div className="eyebrow mb-1">{label}</div>
                  <div className="text-sm">
                    AE's determined value: <span className="font-mono font-bold">{data.context.aeValue ?? "—"}</span>
                  </div>
                  {data.context.personalitySummary && (
                    <p className="text-sm mt-2 whitespace-pre-wrap">{data.context.personalitySummary}</p>
                  )}
                </div>
              )}

              {/* Relevant strengths/weaknesses for skill view */}
              {kind === "skill" && (
                <>
                  {data.context.relevantStrengths?.length > 0 && (
                    <div className="card p-4 bg-brand-emerald/5">
                      <div className="eyebrow mb-1">Related strengths</div>
                      <ul className="list-disc pl-5 space-y-0.5 text-sm">
                        {data.context.relevantStrengths.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {data.context.relevantWeaknesses?.length > 0 && (
                    <div className="card p-4 bg-brand-amber/5">
                      <div className="eyebrow mb-1">Related growth areas</div>
                      <ul className="list-disc pl-5 space-y-0.5 text-sm">
                        {data.context.relevantWeaknesses.map((s: string, i: number) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                </>
              )}

              {/* Contributing answers */}
              <div className="card p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="eyebrow">Contributing answers</div>
                  <span className="meta">{data.answers.length} matching</span>
                </div>
                {data.answers.length === 0 ? (
                  <p className="text-sm text-ink-muted">
                    No answers from the most recent intake mapped to this. Could mean the intake predates this category, or this was determined from broader signals.
                  </p>
                ) : (
                  <ul className="divide-y divide-ink-softLine">
                    {data.answers.map((a, i) => (
                      <li key={i} className="py-3">
                        <div className="text-sm font-medium">{a.questionText}</div>
                        <div className="meta mt-0.5">
                          {a.questionType.toLowerCase().replace("_", " ")}
                          {a.matchedTags.length > 0 && (
                            <> · matched: <span className="font-mono">{a.matchedTags.join(", ")}</span></>
                          )}
                        </div>
                        <div className="mt-1.5 text-sm">
                          <span className="text-ink-muted">Answer: </span>
                          {renderAnswer(a)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

function renderAnswer(a: WhyAnswer): React.ReactNode {
  if (a.optionLabel) {
    return <span className="italic">"{a.optionLabel}"</span>;
  }
  if (a.questionType === "LIKERT" || a.questionType === "SLIDER") {
    const v = typeof a.answerValue === "object" ? (a.answerValue?.value ?? a.answerValue?.score) : a.answerValue;
    return <span className="font-mono">{String(v)}</span>;
  }
  if (typeof a.answerValue === "string") {
    return <span className="whitespace-pre-wrap">{a.answerValue.length > 200 ? a.answerValue.slice(0, 200) + "…" : a.answerValue}</span>;
  }
  return <span className="font-mono text-xs">{JSON.stringify(a.answerValue)}</span>;
}
