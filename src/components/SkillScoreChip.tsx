"use client";
import { useState, useRef, useEffect } from "react";
import { getSkillBenchmark, rubricBandForScore } from "@/lib/skillBenchmarks";

/**
 * Optional override — when the company has customized "what good looks like"
 * for this skill via the company profile's Skills tab, pass it here. The
 * popover shows the override above the platform default and labels both.
 */

/**
 * Clickable skill score row. Shows the score bar inline; clicking opens a
 * popover with the benchmark explainer:
 *   - what the skill IS
 *   - what good looks like at the top end
 *   - the rubric (4 score bands)
 *   - which band this person is in based on their score
 *   - how the score is calculated
 *   - 3-4 concrete coaching moves to grow
 *
 * Used on AE and Director profile pages alike.
 */

function colorForScore(score: number): string {
  if (score >= 80) return "#0E9F6E";
  if (score >= 60) return "#1F3C88";
  if (score >= 40) return "#F59E0B";
  return "#DC2626";
}

export function SkillScoreChip({
  category,
  score,
  orgOverrideWhatGoodLooksLike,
  orgName,
}: {
  category: string;
  score: number;
  // If the user's org has customized this skill, the override text + org name
  // get rendered above the platform default in the popover.
  orgOverrideWhatGoodLooksLike?: string | null;
  orgName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const benchmark = getSkillBenchmark(category);
  const currentBand = rubricBandForScore(category, score);
  const label = benchmark?.label ?? category.replace(/_/g, " ");

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 text-sm text-left hover:bg-brand-indigo/5 rounded-brand p-1 -m-1 transition-colors"
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`How is ${label} graded?`}
      >
        <span className="w-44 font-semibold capitalize">{label}</span>
        <div className="flex-1 h-2 bg-ink-softLine rounded-full overflow-hidden">
          <div
            className="h-full"
            style={{ width: `${score}%`, background: colorForScore(score) }}
          />
        </div>
        <span className="font-mono w-10 text-right">{score}</span>
        <span className="text-ink-muted text-xs shrink-0" aria-hidden="true">ⓘ</span>
      </button>

      {open && benchmark && (
        <div
          role="dialog"
          aria-label={`${label} benchmark`}
          className="absolute z-30 left-0 right-0 mt-1 card border border-ink-softLine shadow-cardHover p-4 text-sm animate-slideUp max-w-2xl"
        >
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <div>
              <div className="font-display font-bold">{label}</div>
              <div className="text-xs text-ink-muted">Score: <span className="font-mono font-bold" style={{ color: colorForScore(score) }}>{score}</span> · {currentBand?.band}</div>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="text-ink-muted hover:text-ink text-lg leading-none" aria-label="Close">×</button>
          </div>

          <p className="text-ink-slate mb-3">{benchmark.definition}</p>

          {/* Where they are now */}
          {currentBand && (
            <div className="mb-3 p-3 rounded-brand bg-brand-indigo/5 border border-brand-indigo/20">
              <div className="text-xs font-bold text-brand-indigo mb-1">Where this person is now</div>
              <p className="text-xs text-ink-slate">{currentBand.behavior}</p>
            </div>
          )}

          {/* What good looks like — org override on top, platform default below if both present */}
          {orgOverrideWhatGoodLooksLike ? (
            <>
              <div className="mb-3">
                <div className="text-xs font-bold text-brand-emerald mb-1">
                  What good looks like at {orgName ?? "your org"}
                </div>
                <p className="text-xs text-ink-slate">{orgOverrideWhatGoodLooksLike}</p>
              </div>
              <div className="mb-3">
                <div className="text-xs font-bold text-ink-muted mb-1">Platform default (for reference)</div>
                <p className="text-xs text-ink-muted italic">{benchmark.whatGoodLooksLike}</p>
              </div>
            </>
          ) : (
            <div className="mb-3">
              <div className="text-xs font-bold text-brand-emerald mb-1">What good looks like</div>
              <p className="text-xs text-ink-slate">{benchmark.whatGoodLooksLike}</p>
            </div>
          )}

          {/* Full rubric */}
          <div className="mb-3">
            <div className="text-xs font-bold text-ink-slate mb-1">Scoring rubric</div>
            <div className="space-y-1.5">
              {benchmark.scoringRubric.map((b, i) => {
                const active = score >= b.minScore && (i === 0 || score < benchmark.scoringRubric[i - 1].minScore);
                return (
                  <div
                    key={b.band}
                    className={`text-xs p-2 rounded-brand border ${
                      active
                        ? "border-brand-indigo bg-brand-indigo/5 font-semibold"
                        : "border-ink-softLine/60"
                    }`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={active ? "text-brand-indigo" : ""}>{b.band}</span>
                      {active && <span className="text-[10px] text-brand-indigo font-bold uppercase">← here</span>}
                    </div>
                    <p className="text-ink-slate font-normal mt-0.5">{b.behavior}</p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* How scored */}
          <div className="mb-3">
            <div className="text-xs font-bold text-ink-slate mb-1">How this score is calculated</div>
            <p className="text-xs text-ink-slate">{benchmark.howScored}</p>
          </div>

          {/* How to grow */}
          <div>
            <div className="text-xs font-bold text-brand-orange mb-1">How to grow this skill</div>
            <ul className="text-xs space-y-0.5 text-ink-slate">
              {benchmark.howToGrow.map((h, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-brand-orange shrink-0">→</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
