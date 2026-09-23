"use client";
import { InfoPopover } from "./InfoPopover";
import { discExplainer, enneagramExplainer, mbtiExplainer, type TypeExplanation } from "@/lib/personalityExplainers";

/**
 * Inline ⓘ button that explains a single personality type — DISC letter,
 * Enneagram number, or MBTI four-letter code. Used on the analyze board so
 * users can learn what "Type 7" or "ENTJ" actually means without navigating
 * away.
 */
export function PersonalityInfoButton({
  framework,
  code,
  triggerLabel,
  onDarkBg,
}: {
  framework: "DISC" | "ENNEAGRAM" | "MBTI";
  code: string;
  /** Optional CTA label, e.g. "Learn more". Default: icon-only. */
  triggerLabel?: string;
  /** Set true when the trigger sits on a brand-color gradient header. */
  onDarkBg?: boolean;
}) {
  let exp: TypeExplanation | null = null;
  if (framework === "DISC") exp = discExplainer(code);
  else if (framework === "ENNEAGRAM") exp = enneagramExplainer(code);
  else if (framework === "MBTI") exp = mbtiExplainer(code);

  if (!exp) return null;

  return (
    <InfoPopover label={exp.label} triggerLabel={triggerLabel} onDarkBg={onDarkBg}>
      <p className="text-ink-slate mb-3 text-xs">{exp.summary}</p>

      <div className="grid sm:grid-cols-2 gap-3 mb-3">
        <div>
          <div className="text-xs font-bold text-brand-emerald mb-1">Strengths</div>
          <ul className="text-xs space-y-0.5 text-ink-slate">
            {exp.strengths.map((s, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-brand-emerald shrink-0">+</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="text-xs font-bold text-brand-amber mb-1">Watch-outs</div>
          <ul className="text-xs space-y-0.5 text-ink-slate">
            {exp.watchOuts.map((s, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-brand-amber shrink-0">↗</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mb-3">
        <div className="text-xs font-bold text-brand-indigo mb-1">In sales</div>
        <p className="text-xs text-ink-slate">{exp.inSales}</p>
      </div>

      <div>
        <div className="text-xs font-bold text-brand-orange mb-1">How to coach them</div>
        <p className="text-xs text-ink-slate">{exp.coachThem}</p>
      </div>
    </InfoPopover>
  );
}
