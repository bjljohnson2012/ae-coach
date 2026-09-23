import type { AeProfile, SkillScore, User } from "@prisma/client";
import { ALL_SKILL_CATEGORIES, scoreToLevel } from "@/lib/scoring";
import { AeSkillTile } from "@/components/AeSkillTile";
import { PersonalityChip } from "@/components/PersonalityChip";
import { discExplainer, enneagramExplainer, mbtiExplainer } from "@/lib/personalityExplainers";

/**
 * AE skill + personality profile card.
 *
 * v3.37.3 — every skill tile and every personality chip is now click-to-explain:
 *   - Skill tile → opens popover with rubric, current level, growth target,
 *     how-to-grow steps, and an "Improve" CTA.
 *   - Personality chip → opens popover with type definition, strengths,
 *     watch-outs, in-sales behavior, how-to-coach (relevant for self-aware AEs).
 *
 * The "Improve" CTA respects the org's per-org button label (passed as
 * improveLabel from the page).
 */
interface Props {
  ae: AeProfile & { user: Pick<User, "name" | "email" | "imageUrl"> };
  scores: SkillScore[];
  /** Org-branded label for the self-coach button. Defaults to "Improve". */
  improveLabel?: string;
}

export function SkillCard({ ae, scores, improveLabel = "Improve" }: Props) {
  const scoreMap = new Map(scores.map((s) => [s.category, s]));
  const avg =
    scores.length > 0
      ? Math.round(scores.reduce((a, s) => a + s.score, 0) / scores.length)
      : 0;

  return (
    <div className="card overflow-hidden">
      {/* Navy banner */}
      <div className="bg-gradient-to-br from-brand-navy via-brand-indigoDeep to-brand-indigo text-white px-6 py-5">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-orange to-brand-indigo flex items-center justify-center text-3xl text-white font-display font-bold shadow-orangeGlow">
            {ae.user.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-white/85 font-semibold">AE Profile Card</div>
            <h2 className="font-display text-2xl font-bold leading-tight tracking-tight">{ae.user.name}</h2>
            {ae.headline && <p className="text-sm text-white/90 italic mt-0.5">{ae.headline}</p>}
            {/* Personality chips — click any to learn what your type means */}
            <div className="flex flex-wrap gap-2 mt-2 text-[11px]">
              {ae.enneagramType && (
                <PersonalityChip
                  framework="ENNEAGRAM"
                  rawCode={ae.enneagramType}
                  explanation={enneagramExplainer(ae.enneagramType)}
                  onDarkBg
                />
              )}
              {ae.discProfile && (
                <PersonalityChip
                  framework="DISC"
                  rawCode={ae.discProfile}
                  explanation={discExplainer(ae.discProfile)}
                  onDarkBg
                />
              )}
              {ae.mbtiType && (
                <PersonalityChip
                  framework="MBTI"
                  rawCode={ae.mbtiType}
                  explanation={mbtiExplainer(ae.mbtiType)}
                  onDarkBg
                />
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[11px] uppercase tracking-wider text-white/85 font-semibold">Overall</div>
            <div className="font-display text-4xl font-bold leading-none">{avg}</div>
            <div className="text-xs text-white/90 mt-1">Lv {scoreToLevel(avg)}</div>
          </div>
        </div>
      </div>

      {/* Skill grid — each tile clickable for level explainer + Improve CTA */}
      <div className="p-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {ALL_SKILL_CATEGORIES.map((cat) => {
            const s = scoreMap.get(cat);
            const score = s?.score ?? 0;
            return (
              <AeSkillTile
                key={cat}
                category={cat}
                score={score}
                source={s?.source ?? null}
                improveLabel={improveLabel}
              />
            );
          })}
        </div>

        {(ae.personalitySummary || ae.salesStyleSummary || ae.communicationSummary) && (
          <div className="mt-6 grid sm:grid-cols-3 gap-4 text-sm pt-6 border-t border-ink-softLine">
            {ae.personalitySummary && (
              <div>
                <div className="eyebrow mb-1.5">Personality</div>
                <p className="text-ink-slate leading-relaxed">{ae.personalitySummary}</p>
              </div>
            )}
            {ae.salesStyleSummary && (
              <div>
                <div className="eyebrow mb-1.5">Sales Style</div>
                <p className="text-ink-slate leading-relaxed">{ae.salesStyleSummary}</p>
              </div>
            )}
            {ae.communicationSummary && (
              <div>
                <div className="eyebrow mb-1.5">Communication</div>
                <p className="text-ink-slate leading-relaxed">{ae.communicationSummary}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
