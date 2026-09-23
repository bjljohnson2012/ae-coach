"use client";
import { useState } from "react";
import { WhyDrawer } from "./WhyDrawer";

interface SkillScore {
  category: string;
  score: number;
  level: number;
}

export function OverviewWithDrills({
  aeProfileId,
  scores,
  enneagramType,
  discProfile,
  mbtiType,
}: {
  aeProfileId: string;
  scores: SkillScore[];
  enneagramType: string | null;
  discProfile: string | null;
  mbtiType: string | null;
}) {
  const [drawer, setDrawer] = useState<{ kind: "skill" | "personality"; value: string; label: string } | null>(null);

  function openSkill(category: string) {
    setDrawer({ kind: "skill", value: category, label: category.replace(/_/g, " ") });
  }
  function openPersonality(prefix: "ENNEAGRAM" | "DISC" | "MBTI", value: string | null) {
    if (!value) return;
    setDrawer({ kind: "personality", value: `${prefix}:${value}`, label: `${prefix} ${value}` });
  }

  function colorForScore(score: number): string {
    if (score >= 80) return "#0E9F6E";
    if (score >= 60) return "#1F3C88";
    if (score >= 40) return "#F59E0B";
    return "#DC2626";
  }

  return (
    <>
      {/* Skill scores — click any to drill in */}
      {scores.length > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="eyebrow">Skill scores</div>
            <span className="meta">click any to see why</span>
          </div>
          <ul className="space-y-2">
            {scores.map((s) => (
              <li key={s.category}>
                <button
                  type="button"
                  onClick={() => openSkill(s.category)}
                  className="w-full flex items-center gap-3 text-sm text-left hover:bg-brand-indigo/5 rounded-brand p-1 -m-1 transition-colors"
                >
                  <span className="w-44 font-semibold capitalize">{s.category.replace(/_/g, " ").toLowerCase()}</span>
                  <div className="flex-1 h-2 bg-ink-softLine rounded-full overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${s.score}%`,
                        background: colorForScore(s.score),
                      }}
                    />
                  </div>
                  <span className="font-mono w-10 text-right">{s.score}</span>
                  <svg className="w-4 h-4 text-ink-muted shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Personality chips — click to drill in */}
      <div className="grid sm:grid-cols-3 gap-3">
        <PersonalityChip label="Enneagram" value={enneagramType} onClick={() => openPersonality("ENNEAGRAM", enneagramType)} />
        <PersonalityChip label="DISC" value={discProfile} onClick={() => openPersonality("DISC", discProfile)} />
        <PersonalityChip label="MBTI" value={mbtiType} onClick={() => openPersonality("MBTI", mbtiType)} />
      </div>

      {drawer && (
        <WhyDrawer
          aeProfileId={aeProfileId}
          open={!!drawer}
          kind={drawer.kind}
          value={drawer.value}
          label={drawer.label}
          onClose={() => setDrawer(null)}
        />
      )}
    </>
  );
}

function PersonalityChip({ label, value, onClick }: { label: string; value: string | null; onClick: () => void }) {
  const interactive = !!value;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={`card p-3 text-center w-full transition-all ${
        interactive ? "cursor-pointer hover:border-brand-indigo hover:shadow-card hover:-translate-y-0.5" : "opacity-60 cursor-default"
      }`}
    >
      <div className="eyebrow">{label}</div>
      <div className="font-display font-bold text-xl mt-1">{value || "—"}</div>
      {interactive && <div className="meta mt-1">click to see why</div>}
    </button>
  );
}
