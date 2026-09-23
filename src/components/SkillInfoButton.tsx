"use client";
import { InfoPopover } from "./InfoPopover";
import { getSkillBenchmark } from "@/lib/skillBenchmarks";

/**
 * Inline ⓘ button that explains a single skill — what it is, what good
 * looks like, the rubric bands, how it's scored, and how to grow it.
 *
 * Used on the analyze board next to each skill row.
 */
export function SkillInfoButton({
  category,
  triggerLabel,
  onDarkBg,
}: {
  category: string;
  /** Optional CTA label, e.g. "Learn more". Default: icon-only. */
  triggerLabel?: string;
  /** Set true when the trigger sits on a brand-color gradient header. */
  onDarkBg?: boolean;
}) {
  const b = getSkillBenchmark(category);
  if (!b) return null;

  return (
    <InfoPopover label={b.label} triggerLabel={triggerLabel} onDarkBg={onDarkBg}>
      <p className="text-ink-slate mb-3 text-xs">{b.definition}</p>

      <div className="mb-3">
        <div className="text-xs font-bold text-brand-emerald mb-1">What good looks like</div>
        <p className="text-xs text-ink-slate">{b.whatGoodLooksLike}</p>
      </div>

      <div className="mb-3">
        <div className="text-xs font-bold text-ink-slate mb-1">Scoring rubric</div>
        <div className="space-y-1.5">
          {b.scoringRubric.map((band) => (
            <div key={band.band} className="text-xs p-2 rounded-brand border border-ink-softLine/60">
              <div className="font-semibold">{band.band}</div>
              <p className="text-ink-slate font-normal mt-0.5">{band.behavior}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs font-bold text-ink-slate mb-1">How this score is calculated</div>
        <p className="text-xs text-ink-slate">{b.howScored}</p>
      </div>

      <div>
        <div className="text-xs font-bold text-brand-orange mb-1">How to grow this skill</div>
        <ul className="text-xs space-y-0.5 text-ink-slate">
          {b.howToGrow.map((h, i) => (
            <li key={i} className="flex gap-1.5">
              <span className="text-brand-orange shrink-0">→</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>
    </InfoPopover>
  );
}
