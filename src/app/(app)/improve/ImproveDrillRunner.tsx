"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Client-side drill runner — v3.37.
 *
 * Three modes:
 *   1. Picker     — user clicks a skill row → opens drill modal
 *   2. Drilling   — show scenario, capture response, submit
 *   3. Feedback   — show grade, points, what they did well, what to fix
 *
 * Modal stays open across the whole arc so transitions feel snappy. Stats
 * banner up the page is left for the next refresh — we just show the live
 * delta in the feedback view ("+85 points · level 3 · 4-day streak").
 */

interface SkillRow {
  category: string;
  label: string;
  emoji: string;
  score: number | null;
}

interface FeedbackPayload {
  score: number;
  pointsAwarded: number;
  summary: string;
  didWell: string[];
  toImprove: string[];
  improvedExample: string;
  expectedBehaviors: string[];
  trapBehaviors: string[];
  stats: { totalPoints: number; level: number; streak: number };
}

export function ImproveDrillRunner({
  role,
  skills,
  startingTotal,
  startingLevel,
  startingStreak,
}: {
  role: string;
  skills: SkillRow[];
  startingTotal: number;
  startingLevel: number;
  startingStreak: number;
}) {
  const router = useRouter();
  const [activeSkill, setActiveSkill] = useState<SkillRow | null>(null);
  const [stage, setStage] = useState<"picker" | "loading" | "drilling" | "submitting" | "feedback">("picker");
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [scenario, setScenario] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [feedback, setFeedback] = useState<FeedbackPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // True once the user has completed at least one drill in this session — the
  // close handler uses this to know whether to refresh the parent banner.
  const [didChange, setDidChange] = useState(false);

  // Live stats (updated when feedback comes back)
  const [liveTotal, setLiveTotal] = useState(startingTotal);
  const [liveLevel, setLiveLevel] = useState(startingLevel);
  const [liveStreak, setLiveStreak] = useState(startingStreak);

  async function startDrill(skill: SkillRow) {
    setActiveSkill(skill);
    setStage("loading");
    setResponse("");
    setFeedback(null);
    setError(null);
    try {
      const res = await fetch("/api/improve/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillCategory: skill.category }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Couldn't start the drill.");
        setStage("picker");
        return;
      }
      const j = await res.json();
      setAttemptId(j.attemptId);
      setScenario(j.scenario);
      setStage("drilling");
    } catch {
      setError("Network error. Try again.");
      setStage("picker");
    }
  }

  async function submitDrill() {
    if (!attemptId || !response.trim()) return;
    setStage("submitting");
    try {
      const res = await fetch("/api/improve/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attemptId, response }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? "Grading failed.");
        setStage("drilling");
        return;
      }
      const j: FeedbackPayload = await res.json();
      setFeedback(j);
      setLiveTotal(j.stats.totalPoints);
      setLiveLevel(j.stats.level);
      setLiveStreak(j.stats.streak);
      setDidChange(true);
      setStage("feedback");
    } catch {
      setError("Network error. Try again.");
      setStage("drilling");
    }
  }

  function reset() {
    setActiveSkill(null);
    setAttemptId(null);
    setScenario("");
    setResponse("");
    setFeedback(null);
    setStage("picker");
    // If anything actually changed in this session, force the parent server
    // component to re-render — that's what updates the top-of-page Level /
    // Total / Streak banner with the new values from the DB.
    if (didChange) {
      router.refresh();
      setDidChange(false);
    }
  }

  return (
    <>
      {/* Skill picker — always visible */}
      <section className="card overflow-hidden">
        <header className="px-5 py-3 border-b border-ink-softLine bg-surface-soft">
          <div className="flex items-center justify-between">
            <div className="font-display font-semibold">Pick a skill to drill</div>
            <span className="meta">lowest scores first — biggest wins</span>
          </div>
        </header>
        <ul className="divide-y divide-ink-softLine">
          {skills.map((s) => (
            <li key={s.category} className="px-5 py-3 hover:bg-brand-indigo/5">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-2xl shrink-0" aria-hidden="true">{s.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{s.label}</div>
                  <div className="meta">
                    {s.score !== null
                      ? <>Current score <span className="font-mono">{s.score}</span></>
                      : "No score yet — drilling will start to inform one"}
                  </div>
                </div>
                {s.score !== null && (
                  <div className="hidden sm:block w-32 h-2 bg-ink-softLine rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full"
                      style={{
                        width: `${s.score}%`,
                        background: s.score >= 80 ? "#0E9F6E" : s.score >= 60 ? "#1F3C88" : s.score >= 40 ? "#F59E0B" : "#DC2626",
                      }}
                    />
                  </div>
                )}
                <button
                  onClick={() => startDrill(s)}
                  className="btn-primary text-sm whitespace-nowrap shrink-0"
                >
                  Drill
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {error && stage === "picker" && (
        <div className="mt-3 text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand px-3 py-2">
          {error}
        </div>
      )}

      {/* Drill modal */}
      {stage !== "picker" && activeSkill && (
        <>
          <div className="fixed inset-0 bg-brand-navy/60 z-30" onClick={() => stage !== "submitting" && reset()} />
          <div className="fixed inset-0 z-40 flex items-start justify-center p-4 pointer-events-none overflow-y-auto">
            <div className="card max-w-2xl w-full p-6 my-6 pointer-events-auto animate-slideUp max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">{activeSkill.emoji}</span>
                  <h2 className="h-section">{activeSkill.label}</h2>
                </div>
                <button
                  onClick={reset}
                  disabled={stage === "submitting"}
                  className="text-ink-muted hover:text-ink text-xl leading-none disabled:opacity-40"
                >
                  ✕
                </button>
              </div>

              {/* Loading state */}
              {stage === "loading" && (
                <div className="py-12 text-center">
                  <div className="text-3xl mb-3 animate-pulse">✨</div>
                  <p className="text-sm text-ink-muted">Building a scenario for you…</p>
                </div>
              )}

              {/* Drilling — scenario + response field */}
              {(stage === "drilling" || stage === "submitting") && (
                <>
                  <div className="card p-4 bg-surface-soft mb-4">
                    <div className="text-xs uppercase tracking-wider font-bold text-brand-indigo mb-2">Scenario</div>
                    <p className="text-sm text-ink whitespace-pre-wrap">{scenario}</p>
                  </div>
                  <label className="label">Your response</label>
                  <textarea
                    className="input min-h-[140px]"
                    placeholder="Type what you'd say or do..."
                    value={response}
                    onChange={(e) => setResponse(e.target.value)}
                    disabled={stage === "submitting"}
                    autoFocus
                  />
                  <p className="meta mt-1.5">
                    No "right" answer — your phrasing matters. Be specific.
                  </p>
                  {error && (
                    <div className="mt-3 text-sm text-brand-red">{error}</div>
                  )}
                  <div className="flex justify-between gap-2 pt-4">
                    <button onClick={reset} disabled={stage === "submitting"} className="btn-ghost">
                      Cancel
                    </button>
                    <button
                      onClick={submitDrill}
                      disabled={stage === "submitting" || !response.trim()}
                      className="btn-primary"
                    >
                      {stage === "submitting" ? "Grading…" : "Submit response"}
                    </button>
                  </div>
                </>
              )}

              {/* Feedback */}
              {stage === "feedback" && feedback && (
                <>
                  {/* Score banner */}
                  <ScoreBanner score={feedback.score} pointsAwarded={feedback.pointsAwarded} />

                  <p className="text-sm text-ink mb-4">{feedback.summary}</p>

                  <div className="grid sm:grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="text-xs font-bold text-brand-emerald mb-1">What you did well</div>
                      <ul className="text-xs space-y-1 text-ink-slate">
                        {feedback.didWell.map((s, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span className="text-brand-emerald shrink-0">+</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-brand-amber mb-1">To improve</div>
                      <ul className="text-xs space-y-1 text-ink-slate">
                        {feedback.toImprove.map((s, i) => (
                          <li key={i} className="flex gap-1.5">
                            <span className="text-brand-amber shrink-0">→</span>
                            <span>{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {feedback.improvedExample && (
                    <div className="card p-3 bg-brand-indigo/5 border border-brand-indigo/20 mb-4">
                      <div className="text-xs font-bold text-brand-indigo mb-1">A 90+ response would say</div>
                      <p className="text-xs text-ink-slate italic">{feedback.improvedExample}</p>
                    </div>
                  )}

                  {/* Live stats — instant gratification */}
                  <div className="card p-3 bg-gradient-to-br from-brand-indigo/10 to-brand-orange/10 mb-4">
                    <div className="grid grid-cols-3 text-center">
                      <div>
                        <div className="text-xs text-ink-muted">Total</div>
                        <div className="font-display text-xl font-bold text-brand-indigo">{liveTotal.toLocaleString()}</div>
                      </div>
                      <div>
                        <div className="text-xs text-ink-muted">Level</div>
                        <div className="font-display text-xl font-bold text-brand-indigo">{liveLevel}</div>
                      </div>
                      <div>
                        <div className="text-xs text-ink-muted">Streak</div>
                        <div className="font-display text-xl font-bold text-brand-orange">{liveStreak}d</div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between gap-2">
                    <button onClick={reset} className="btn-ghost">Done</button>
                    <button onClick={() => activeSkill && startDrill(activeSkill)} className="btn-primary">
                      Drill again
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function ScoreBanner({ score, pointsAwarded }: { score: number; pointsAwarded: number }) {
  const tone =
    score >= 90 ? { bg: "from-brand-emerald to-brand-indigo", label: "Excellent" } :
    score >= 75 ? { bg: "from-brand-indigo to-brand-orange", label: "Strong" } :
    score >= 60 ? { bg: "from-brand-orange to-brand-amber", label: "Solid" } :
    { bg: "from-brand-amber to-brand-red", label: "Keep going" };

  return (
    <div className={`card p-4 mb-4 bg-gradient-to-br ${tone.bg} text-white`}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <div className="text-xs uppercase tracking-wider opacity-80">{tone.label}</div>
          <div className="font-display text-4xl font-bold">{score}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-wider opacity-80">Earned</div>
          <div className="font-display text-2xl font-bold">+{pointsAwarded} pts</div>
        </div>
      </div>
    </div>
  );
}
