"use client";
import { useEffect, useState, useCallback } from "react";

/**
 * Coaching Plans tab — renders all plans for one user. Unread plans get a
 * lit-up indicator. Click a plan to expand + mark it read.
 *
 * Polls every 4 seconds while any plan is GENERATING so the UI flips to
 * READY without a manual refresh.
 */

interface GrowthArea {
  area: string;
  why: string;
  weeklyMoves: string[];
}
interface BookRec { title: string; author?: string; reason: string }
interface PlanContent {
  title: string;
  summary: string;
  growthAreas: GrowthArea[];
  weeklyHabits: string[];
  bookOrPodRecs: BookRec[];
  ninetyDayCheckpoint: string;
}

interface PlanRow {
  id: string;
  title: string | null;
  status: "GENERATING" | "READY" | "FAILED";
  generatedJson: PlanContent;
  errorMessage?: string | null;
  tasksSpawned: number;
  unread: boolean;
  createdAt: string;
  builtBy: { name: string };
}

export function CoachingPlansTab({ userId, viewerId }: { userId: string; viewerId: string }) {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/users/${userId}/coaching-plans`);
    const j = await res.json().catch(() => ({}));
    setPlans(j.plans ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { void load(); }, [load]);

  // Poll while any plan is generating
  useEffect(() => {
    const generating = plans.some((p) => p.status === "GENERATING");
    if (!generating) return;
    const interval = setInterval(() => { void load(); }, 4000);
    return () => clearInterval(interval);
  }, [plans, load]);

  async function build() {
    setBuilding(true);
    setError(null);
    const res = await fetch(`/api/users/${userId}/coaching-plans`, { method: "POST" });
    setBuilding(false);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Could not start the plan.");
      return;
    }
    await load();
  }

  async function openPlan(plan: PlanRow) {
    setOpenPlanId(plan.id === openPlanId ? null : plan.id);
    if (plan.unread) {
      // Mark read in the background; optimistic UI update.
      setPlans((ps) => ps.map((p) => (p.id === plan.id ? { ...p, unread: false } : p)));
      void fetch(`/api/coaching-plans/${plan.id}`, { method: "PATCH" });
    }
  }

  if (loading) {
    return <div className="card p-6 text-sm text-ink-muted">Loading coaching plans…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="eyebrow mb-1">Coaching Plans</div>
            <h2 className="h-section">Personalized growth plan</h2>
            <p className="text-sm text-ink-muted mt-1">
              Generate a plan tailored to this person's personality and skill gaps.
              Each plan auto-creates tasks they can work through.
            </p>
          </div>
          <button onClick={build} disabled={building} className="btn-primary">
            {building ? "Starting…" : plans.length === 0 ? "+ Build Coaching Plan" : "+ Build Another Plan"}
          </button>
        </div>
        {error && (
          <div className="text-sm text-brand-red bg-brand-red/5 border border-brand-red/20 rounded-brand p-3 mt-3">
            {error}
          </div>
        )}
      </div>

      {plans.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink-muted">
          No coaching plans yet. Click "Build Coaching Plan" to generate the first one.
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const isOpen = openPlanId === plan.id;
            const isGenerating = plan.status === "GENERATING";
            const isFailed = plan.status === "FAILED";
            return (
              <div
                key={plan.id}
                className={`card overflow-hidden transition-all ${
                  plan.unread && !isGenerating && !isFailed ? "border-l-4 border-brand-orange shadow-orangeGlow" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => !isGenerating && !isFailed && openPlan(plan)}
                  disabled={isGenerating || isFailed}
                  className={`w-full text-left p-4 flex items-start gap-3 ${
                    isGenerating || isFailed ? "" : "hover:bg-brand-indigo/5 cursor-pointer"
                  }`}
                >
                  <div className="text-2xl shrink-0" aria-hidden="true">
                    {isGenerating ? "⏳" : isFailed ? "⚠" : plan.unread ? "✨" : "📘"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-display font-semibold">
                        {plan.title || (isGenerating ? "Building your plan…" : "Coaching plan")}
                      </span>
                      {plan.unread && !isGenerating && !isFailed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-orange text-white text-[10px] font-bold uppercase tracking-wider">
                          ✦ New
                        </span>
                      )}
                      {isGenerating && (
                        <span className="badge-warning text-[10px]">Generating… (safe to leave)</span>
                      )}
                      {isFailed && (
                        <span className="badge-warning text-[10px] !text-brand-red !bg-brand-red/10 !border-brand-red/20">
                          Failed: {plan.errorMessage?.slice(0, 60) ?? "unknown"}
                        </span>
                      )}
                    </div>
                    <div className="meta mt-0.5">
                      Built by {plan.builtBy.name} · {new Date(plan.createdAt).toLocaleDateString()}
                      {plan.tasksSpawned > 0 && <> · {plan.tasksSpawned} task{plan.tasksSpawned === 1 ? "" : "s"} created</>}
                    </div>
                  </div>
                  {!isGenerating && !isFailed && (
                    <span className="text-ink-muted text-sm shrink-0">{isOpen ? "▲" : "▼"}</span>
                  )}
                </button>

                {isOpen && plan.generatedJson && (
                  <PlanContentView content={plan.generatedJson} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PlanContentView({ content }: { content: PlanContent }) {
  return (
    <div className="border-t border-ink-softLine p-5 space-y-4 bg-surface-soft">
      {content.summary && (
        <p className="text-sm text-ink-slate italic">{content.summary}</p>
      )}

      {content.growthAreas?.length > 0 && (
        <div>
          <div className="eyebrow mb-2">Growth areas</div>
          <div className="space-y-3">
            {content.growthAreas.map((g, i) => (
              <div key={i} className="card p-4 bg-white">
                <div className="font-display font-semibold mb-1">{g.area}</div>
                <p className="text-xs text-ink-slate mb-2">{g.why}</p>
                {g.weeklyMoves?.length > 0 && (
                  <>
                    <div className="text-[10px] uppercase tracking-wider text-ink-muted font-bold mb-1">
                      Weekly moves (now in your tasks)
                    </div>
                    <ul className="text-xs space-y-1">
                      {g.weeklyMoves.map((m, j) => (
                        <li key={j} className="flex gap-2">
                          <span className="text-brand-emerald shrink-0">→</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {content.weeklyHabits?.length > 0 && (
        <div>
          <div className="eyebrow mb-2">Weekly habits to build</div>
          <ul className="text-sm space-y-1">
            {content.weeklyHabits.map((h, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-brand-indigo shrink-0">·</span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.bookOrPodRecs?.length > 0 && (
        <div>
          <div className="eyebrow mb-2">Recommended reading / listening</div>
          <ul className="text-sm space-y-1.5">
            {content.bookOrPodRecs.map((r, i) => (
              <li key={i}>
                <strong>{r.title}</strong>{r.author && <> · {r.author}</>}
                <div className="text-xs text-ink-muted">{r.reason}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {content.ninetyDayCheckpoint && (
        <div className="card p-4 bg-brand-emerald/5 border-l-4 border-brand-emerald">
          <div className="eyebrow mb-1">90-day checkpoint</div>
          <p className="text-sm">{content.ninetyDayCheckpoint}</p>
        </div>
      )}
    </div>
  );
}
