"use client";
import { useEffect, useState } from "react";

interface SupportingAnswer {
  questionText: string;
  questionType: string;
  answerLabel: string;          // friendly: "Strongly agree (5/5)" or '"Take charge and drive"'
  impact: string;               // why this answer matters for THIS field
  matchedTags: string[];
}

interface BroaderSignal {
  label: string;
  signal: string;
  tone?: "neutral" | "positive" | "watch";
}

interface Detail {
  target: { name: string; role: string; email: string };
  field: string;
  label: string;
  primaryText: string | null;
  primaryList: string[];
  supportingAnswers: SupportingAnswer[];
  answerSetCompletedAt: string | null;
  coachingNotes: Array<{ date: string; content: string; directorName: string }>;
  scoreHistory?: Array<{ category: string; score: number; recordedAt: string; source: string }>;
  reviewExcerpts?: Array<{ monthOf: string; directorName: string; questionText: string; answerLabel: string }>;
  prepMentions?: Array<{ date: string; preparedByName: string; summary: string; matchedSection?: string }>;
  broaderSignals?: BroaderSignal[];
  coachingHints?: string[] | null;
  coachingHintsAvailable?: boolean;
  coachingHintsAt?: string | null;
  viewerIsLeader?: boolean;
  empty?: boolean;
  reason?: string;
}

/**
 * Wraps any profile prose card. Click → slide-in drawer with the synthesized text
 * + the answers / notes that informed it.
 *
 * Usage:
 *   <ProfileCardTrigger userId={userId} field="strengths">
 *     <div>...your strengths card...</div>
 *   </ProfileCardTrigger>
 */
export function ProfileCardTrigger({
  userId,
  field,
  children,
}: {
  userId: string;
  field: "personality" | "salesStyle" | "communication" | "motivations" | "strengths" | "weaknesses";
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setData(null);
    setError(null);
    fetch(`/api/users/${userId}/profile-detail?field=${encodeURIComponent(field.toLowerCase())}`)
      .then(async (r) => {
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error || "Failed");
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [open, userId, field]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="card p-5 w-full text-left cursor-pointer transition-all hover:shadow-cardHover hover:-translate-y-0.5 hover:border-brand-indigo/30 group block"
      >
        {children}
        <div className="mt-3 pt-3 border-t border-ink-softLine flex items-center justify-between text-xs text-ink-muted group-hover:text-brand-indigo transition-colors">
          <span>See the answers + reviews behind this</span>
          <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => setOpen(false)} />
          <aside className="fixed right-0 top-0 bottom-0 z-40 w-full max-w-xl bg-white border-l border-ink-softLine shadow-cardHover overflow-y-auto animate-slideUp">
            <header className="sticky top-0 bg-white border-b border-ink-softLine px-5 py-3 flex items-center justify-between z-10">
              <div>
                <div className="eyebrow">Why this {data?.label?.toLowerCase() ?? "?"}</div>
                <div className="font-display font-semibold text-lg">
                  {data?.target?.name ?? "Loading…"}
                </div>
                {data?.answerSetCompletedAt && (
                  <div className="meta mt-0.5">last intake {new Date(data.answerSetCompletedAt).toLocaleDateString()}</div>
                )}
              </div>
              <button onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink text-lg">✕</button>
            </header>

            <div className="px-5 py-4 space-y-4">
              {loading && <div className="text-sm text-ink-muted">Loading…</div>}
              {error && <div className="text-sm text-brand-red">{error}</div>}

              {data?.empty && (
                <div className="card p-5 text-sm text-ink-muted text-center">{data.reason}</div>
              )}

              {data && !data.empty && (
                <>
                  {/* Primary content — the synthesized text or list */}
                  {data.primaryText && (
                    <div className="card p-5 bg-brand-indigo/5 border-l-4 border-brand-indigo">
                      <div className="eyebrow mb-1">{data.label}</div>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{data.primaryText}</p>
                    </div>
                  )}

                  {data.primaryList.length > 0 && (
                    <div className="card p-5">
                      <div className="eyebrow mb-2">{data.label}</div>
                      <ul className="list-disc pl-5 space-y-1.5 text-sm">
                        {data.primaryList.map((item, i) => <li key={i}>{item}</li>)}
                      </ul>
                    </div>
                  )}

                  {!data.primaryText && data.primaryList.length === 0 && (
                    <div className="card p-5 text-sm text-ink-muted text-center">
                      No content recorded yet.
                    </div>
                  )}

                  {/* Broader signals — ALWAYS shown */}
                  {data.broaderSignals && data.broaderSignals.length > 0 && (
                    <div className="card p-5">
                      <div className="eyebrow mb-2">Broader signals</div>
                      <ul className="space-y-1.5 text-sm">
                        {data.broaderSignals.map((s, i) => (
                          <li key={i} className="flex justify-between gap-3">
                            <span className="text-ink-muted">{s.label}</span>
                            <span className={`font-medium ${
                              s.tone === "positive" ? "text-brand-emerald" :
                              s.tone === "watch" ? "text-brand-amber" : ""
                            }`}>{s.signal}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Supporting answers — friendly + impact rationale */}
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="eyebrow">Answers that informed this</div>
                      <span className="meta">{data.supportingAnswers.length} matching</span>
                    </div>
                    {data.supportingAnswers.length === 0 ? (
                      <p className="text-sm text-ink-muted italic">
                        No specific answers tagged for this field. The synthesis was driven by the broader signals above.
                      </p>
                    ) : (
                      <ul className="divide-y divide-ink-softLine">
                        {data.supportingAnswers.map((a, i) => (
                          <li key={i} className="py-3">
                            <div className="text-sm font-medium">{a.questionText}</div>
                            <div className="meta mt-0.5">
                              {a.questionType.toLowerCase().replace("_", " ")}
                              {a.matchedTags.length > 0 && (
                                <> · <span className="font-mono">{a.matchedTags.join(", ")}</span></>
                              )}
                            </div>
                            <div className="mt-1.5 text-sm">
                              <span className="text-ink-muted">Their answer: </span>
                              <span className="font-medium">{a.answerLabel}</span>
                            </div>
                            <div className="mt-1 text-xs text-brand-indigo italic">
                              → {a.impact}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* Note: Coaching hints now live in the dedicated "Coaching Hints" tab on the profile. */}

                  {/* Coaching notes — for strengths/weaknesses primarily */}
                  {data.coachingNotes.length > 0 && (
                    <div className="card p-5 bg-brand-emerald/5">
                      <div className="eyebrow mb-2">Recent coaching notes</div>
                      <ul className="space-y-2 text-sm">
                        {data.coachingNotes.map((n, i) => (
                          <li key={i} className="border-l-2 border-brand-emerald/50 pl-2">
                            <div className="meta">{n.date} · {n.directorName}</div>
                            <p className="whitespace-pre-wrap mt-0.5">{n.content}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Score history relevant to this field */}
                  {data.scoreHistory && data.scoreHistory.length > 0 && (
                    <div className="card p-5">
                      <div className="eyebrow mb-2">Score history</div>
                      <ul className="text-sm space-y-1">
                        {data.scoreHistory.map((h, i) => (
                          <li key={i} className="flex justify-between gap-3 border-b border-ink-softLine/40 py-1">
                            <span><span className="font-mono">{h.category}</span> · {h.score}</span>
                            <span className="meta">{h.source} · {new Date(h.recordedAt).toLocaleDateString()}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Director review excerpts */}
                  {data.reviewExcerpts && data.reviewExcerpts.length > 0 && (
                    <div className="card p-5 bg-brand-amber/5">
                      <div className="eyebrow mb-2">From monthly reviews</div>
                      <ul className="space-y-2 text-sm">
                        {data.reviewExcerpts.map((r, i) => (
                          <li key={i} className="border-l-2 border-brand-amber/60 pl-2">
                            <div className="meta">{r.monthOf} · {r.directorName}</div>
                            <div className="font-medium mt-0.5">{r.questionText}</div>
                            <div className="meta italic mt-0.5">{r.answerLabel}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 1:1 prep mentions */}
                  {data.prepMentions && data.prepMentions.length > 0 && (
                    <div className="card p-5 bg-brand-indigo/5">
                      <div className="eyebrow mb-2">From 1:1 preps</div>
                      <ul className="space-y-2 text-sm">
                        {data.prepMentions.map((p, i) => (
                          <li key={i} className="border-l-2 border-brand-indigo/60 pl-2">
                            <div className="meta">{p.date} · {p.preparedByName}{p.matchedSection ? ` · "${p.matchedSection}"` : ""}</div>
                            <p className="mt-0.5">{p.summary.length > 220 ? p.summary.slice(0, 220) + "…" : p.summary}</p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </>
      )}
    </>
  );
}

