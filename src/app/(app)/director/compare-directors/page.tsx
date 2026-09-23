/**
 * /director/compare-directors?ids=dp1,dp2,dp3
 * Side-by-side Director comparison: personality, leadership/forecasting/communication
 * skill scores, strengths, growth areas, motivations.
 *
 * Audience:
 *   - VP_SALES: directors who report to them (vpId = ctx.userId)
 *   - COMPANY_ADMIN: every director in their org
 *   - ORG_ADMIN: every director in every org
 *   - DIRECTOR / AE: not allowed
 */
import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { CompareSelector } from "../compare/CompareSelector";

const SKILL_ORDER = ["LEADERSHIP", "FORECASTING", "COMMUNICATION", "RESILIENCE"];

export default async function CompareDirectorsPage({ searchParams }: { searchParams: { ids?: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");

  // Build the where clause based on role
  let where: any = { lastSynthesizedAt: { not: null } };
  if (ctx.role === "VP_SALES") {
    where = { ...where, user: { vpId: ctx.userId, role: "DIRECTOR" } };
  } else if (ctx.role === "COMPANY_ADMIN") {
    where = { ...where, orgId: ctx.effectiveOrgId };
  }
  // ORG_ADMIN — no extra filter beyond synthesized

  const accessibleDirectors = await prisma.directorProfile.findMany({
    where,
    include: { user: { select: { id: true, name: true, email: true, imageUrl: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const selectedIds = (searchParams.ids ?? "").split(",").filter(Boolean).slice(0, 4);
  const selected = selectedIds.length > 0
    ? await prisma.directorProfile.findMany({
        where: { id: { in: selectedIds }, ...(ctx.role === "COMPANY_ADMIN" ? { orgId: ctx.effectiveOrgId } : {}) },
        include: {
          user: { select: { id: true, name: true, email: true, imageUrl: true } },
          skillScores: true,
          org: { select: { name: true } },
        },
      })
    : [];

  // Preserve query order
  const orderedSelected = selectedIds
    .map((id) => selected.find((s) => s.id === id))
    .filter(Boolean) as typeof selected;

  return (
    <div className="page max-w-7xl">
      <header className="mb-5">
        <Link href="/dashboard" className="link text-sm">← Dashboard</Link>
        <h1 className="h-page mt-2">Compare Directors</h1>
        <p className="text-sm text-ink-muted mt-1">
          Pick 2-4 directors to see them side-by-side. Useful for promotion decisions,
          identifying which leadership style is the best match for a struggling territory,
          and spotting forecasting drift across the team.
        </p>
      </header>

      <CompareSelector
        pool={accessibleDirectors.map((d) => ({
          id: d.id,
          name: d.user.name,
          email: d.user.email,
          imageUrl: d.user.imageUrl,
        }))}
        selectedIds={selectedIds}
        entityLabel="directors"
        routeBase="/director/compare-directors"
      />

      {orderedSelected.length === 0 ? (
        <div className="card p-12 text-center mt-6">
          <p className="text-sm text-ink-muted">Pick at least 2 directors above to see the side-by-side view.</p>
        </div>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2 text-xs uppercase tracking-wider text-ink-muted font-semibold align-bottom w-44">Trait</th>
                {orderedSelected.map((d) => (
                  <th key={d.id} className="px-3 py-2 align-bottom min-w-[200px]">
                    <Link href={`/director/director/${d.id}`} className="block text-left hover:text-brand-indigo">
                      <div className="flex items-center gap-2 mb-1">
                        {d.user.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={d.user.imageUrl} alt={d.user.name} className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-xs font-bold">
                            {d.user.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")}
                          </div>
                        )}
                        <div>
                          <div className="font-display font-bold">{d.user.name}</div>
                          {ctx.role === "ORG_ADMIN" && d.org?.name && (
                            <div className="meta">{d.org.name}</div>
                          )}
                        </div>
                      </div>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="border-t border-ink-softLine">
              {/* Personality stack */}
              <Row label="Enneagram" cells={orderedSelected.map((d) => d.enneagramType ?? "—")} mono />
              <Row label="DISC" cells={orderedSelected.map((d) => d.discProfile ?? "—")} mono />
              <Row label="MBTI" cells={orderedSelected.map((d) => d.mbtiType ?? "—")} mono />

              {/* Skill scores (director-flavored: LEADERSHIP / FORECASTING / COMMUNICATION / RESILIENCE) */}
              <SectionDivider label="Leadership skills" />
              {SKILL_ORDER.map((cat) => (
                <Row
                  key={cat}
                  label={cat.replace(/_/g, " ").toLowerCase()}
                  capitalize
                  cells={orderedSelected.map((d) => {
                    const s = d.skillScores.find((x: any) => x.category === cat);
                    return s ? <ScoreBar score={s.score} key={d.id} /> : "—";
                  })}
                />
              ))}
              <Row
                label="Avg skill"
                cells={orderedSelected.map((d) => {
                  const scores = d.skillScores;
                  if (scores.length === 0) return "—";
                  const avg = Math.round(scores.reduce((s: number, x: any) => s + x.score, 0) / scores.length);
                  return <span className="font-mono font-bold">{avg}</span>;
                })}
              />

              {/* Forecasting summary — director-specific signal not on AE compare */}
              <SectionDivider label="Forecasting style" />
              <Row
                label="How they forecast"
                cells={orderedSelected.map((d) => (
                  <p key={d.id} className="text-xs whitespace-pre-line">{d.forecastingSummary ?? "—"}</p>
                ))}
              />

              {/* Strengths */}
              <SectionDivider label="Strengths" />
              <Row
                label="Top strengths"
                cells={orderedSelected.map((d) => {
                  const s = (d.strengthsJson as string[]) ?? [];
                  return (
                    <ul className="space-y-0.5 text-xs" key={d.id}>
                      {s.slice(0, 4).map((x, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-brand-emerald">+</span>{x}
                        </li>
                      ))}
                    </ul>
                  );
                })}
              />

              {/* Growth */}
              <SectionDivider label="Growth areas" />
              <Row
                label="Top growth areas"
                cells={orderedSelected.map((d) => {
                  const s = (d.weaknessesJson as string[]) ?? [];
                  return (
                    <ul className="space-y-0.5 text-xs" key={d.id}>
                      {s.slice(0, 4).map((x, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-brand-amber">↗</span>{x}
                        </li>
                      ))}
                    </ul>
                  );
                })}
              />

              {/* Motivations */}
              <SectionDivider label="Motivations" />
              <Row
                label="Drivers"
                cells={orderedSelected.map((d) => {
                  const m = (d.motivations as string[]) ?? [];
                  return (
                    <ul className="space-y-0.5 text-xs" key={d.id}>
                      {m.slice(0, 3).map((x, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-brand-indigo">→</span>{x}
                        </li>
                      ))}
                    </ul>
                  );
                })}
              />
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ label, cells, mono, capitalize }: { label: string; cells: (string | React.ReactNode)[]; mono?: boolean; capitalize?: boolean }) {
  return (
    <tr className="border-b border-ink-softLine/50 align-top">
      <td className={`px-3 py-3 text-xs text-ink-muted font-semibold ${capitalize ? "capitalize" : ""}`}>{label}</td>
      {cells.map((c, i) => (
        <td key={i} className={`px-3 py-3 text-sm ${mono ? "font-mono font-bold" : ""}`}>{c}</td>
      ))}
    </tr>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <tr className="bg-surface-soft">
      <td colSpan={99} className="px-3 py-1.5 text-[10px] uppercase tracking-wider font-bold text-ink-slate">
        {label}
      </td>
    </tr>
  );
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? "#0E9F6E" : score >= 60 ? "#1F3C88" : score >= 40 ? "#F59E0B" : "#DC2626";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-ink-softLine rounded-full overflow-hidden">
        <div className="h-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="font-mono text-xs w-8 text-right">{score}</span>
    </div>
  );
}
