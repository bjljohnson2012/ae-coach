"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getSkillBenchmark, rubricBandForScore } from "@/lib/skillBenchmarks";
import { SKILL_CATEGORY_LABELS, scoreToLevel } from "@/lib/scoring";
import type { SkillCategory, ScoreSource } from "@prisma/client";

/**
 * Tile-shaped skill chip used on the AE's own skill card. Click → portal
 * popover that explains:
 *   - what the skill IS
 *   - which level (1-5) you're currently in and why
 *   - what behaviors define the next level — your growth target
 *   - 3-4 specific moves to grow it
 *   - "Try a drill" CTA → /improve
 *
 * Visual is identical to the previous static tile so the card layout doesn't
 * shift; only the wrapper becomes a button and a popover appears on click.
 *
 * Why portal: the parent <div className="card overflow-hidden"> would clip an
 * absolutely-positioned popover. Same fix used by InfoPopover.
 */
export function AeSkillTile({
  category,
  score,
  source,
  improveLabel,
}: {
  category: SkillCategory;
  score: number;
  source?: ScoreSource | null;
  improveLabel: string;
}) {
  const meta = SKILL_CATEGORY_LABELS[category];
  const benchmark = getSkillBenchmark(category);
  const level = scoreToLevel(score);
  const currentBand = rubricBandForScore(category, score);

  // Find the band one notch above current — that's the user's growth target.
  const nextBand = benchmark
    ? benchmark.scoringRubric.find((b) => b.minScore > score) ?? null
    : null;

  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    function recompute() {
      const t = triggerRef.current;
      if (!t) return;
      const r = t.getBoundingClientRect();
      const popoverWidth = Math.min(480, window.innerWidth - 32);
      let left = r.left;
      if (left + popoverWidth > window.innerWidth - 16) {
        left = window.innerWidth - popoverWidth - 16;
      }
      if (left < 16) left = 16;
      setPos({ top: r.bottom + 6, left, width: popoverWidth });
    }
    recompute();
    window.addEventListener("scroll", recompute, true);
    window.addEventListener("resize", recompute);
    return () => {
      window.removeEventListener("scroll", recompute, true);
      window.removeEventListener("resize", recompute);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
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
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-brand border border-ink-softLine p-3.5 hover:border-brand-indigo/30 transition-colors text-left w-full focus-visible:ring-2 focus-visible:ring-brand-indigo focus-visible:outline-none"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">
            <span className="mr-1.5">{meta?.emoji}</span>
            {meta?.label ?? category}
          </span>
          <span className="badge-neutral text-[10px]">Lv {level}</span>
        </div>
        <div className="mt-2.5 h-2 bg-ink-softLine rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${
              score >= 80
                ? "bg-brand-emerald"
                : score >= 50
                  ? "bg-gradient-to-r from-brand-indigo to-brand-orange"
                  : "bg-brand-amber"
            }`}
            style={{ width: `${score}%` }}
          />
        </div>
        <div className="flex justify-between mt-1.5">
          <span className="font-mono text-xs font-semibold text-ink-slate">{score}/100</span>
          <span className="text-[10px] text-ink-muted">click to learn more</span>
        </div>
      </button>

      {mounted && open && pos && benchmark && createPortal(
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={`${meta?.label ?? category} explainer`}
          className="fixed z-[60] card border border-ink-softLine shadow-cardHover p-5 text-sm animate-slideUp"
          style={{ top: pos.top, left: pos.left, width: pos.width }}
        >
          {/* Header */}
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <div>
              <div className="font-display font-bold text-base">{benchmark.label}</div>
              <div className="text-xs text-ink-muted mt-0.5">
                Score <span className="font-mono font-bold text-ink-slate">{score}</span>
                {" · "}Level <span className="font-mono font-bold text-ink-slate">{level}</span>
                {currentBand && <> · {currentBand.band}</>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-ink-muted hover:text-ink text-lg leading-none"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <p className="text-ink-slate mt-3 mb-4">{benchmark.definition}</p>

          {/* Where you are now */}
          {currentBand && (
            <div className="mb-3 p-3 rounded-brand bg-brand-indigo/5 border border-brand-indigo/20">
              <div className="text-xs font-bold text-brand-indigo mb-1">Where you are now</div>
              <p className="text-xs text-ink-slate">{currentBand.behavior}</p>
            </div>
          )}

          {/* What the next level looks like */}
          {nextBand && (
            <div className="mb-3 p-3 rounded-brand bg-brand-emerald/5 border border-brand-emerald/20">
              <div className="text-xs font-bold text-brand-emerald mb-1">
                Your growth target — {nextBand.band}
              </div>
              <p className="text-xs text-ink-slate">{nextBand.behavior}</p>
            </div>
          )}

          {/* How this score is calculated */}
          <div className="mb-4">
            <div className="text-xs font-bold text-ink-slate mb-1">How this score is calculated</div>
            <p className="text-xs text-ink-slate">{benchmark.howScored}</p>
          </div>

          {/* How to grow */}
          <div className="mb-4">
            <div className="text-xs font-bold text-brand-orange mb-1">How to grow this skill</div>
            <ul className="text-xs space-y-1 text-ink-slate">
              {benchmark.howToGrow.map((h, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-brand-orange shrink-0">→</span>
                  <span>{h}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* CTA — drill on this exact skill */}
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-ink-softLine">
            <span className="text-xs text-ink-slate">
              Ready to push the score?
            </span>
            <Link
              href="/improve"
              className="btn-primary text-xs whitespace-nowrap"
              onClick={() => setOpen(false)}
            >
              ✨ {improveLabel}
            </Link>
          </div>

          {/* Source attribution — explains why score may differ from AI default */}
          {source && source !== "AI" && (
            <div className="meta mt-3 pt-2 border-t border-ink-softLine">
              {source === "DIRECTOR_OVERRIDE" && "Adjusted by your director."}
              {source === "MONTHLY_REVIEW" && "Updated from your latest monthly review."}
              {source === "AE_SELF" && "Set by you."}
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * v3.37.9 alias — used by the Director / VP / Admin self-profile so the
 * import name matches the use case ("profile skill", not "AE skill").
 * Same component, no behavioral difference.
 */
export const ProfileSkillTile = AeSkillTile;
