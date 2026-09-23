/**
 * /director/compare?ids=ae1,ae2,ae3
 * Side-by-side AE comparison: personality, skill scores, strengths/growth, motivations.
 */
import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { CompareSelector } from "./CompareSelector";
import { CompareNarrative } from "./CompareNarrative";

const SKILL_ORDER = ["DISCOVERY", "OBJECTION_HANDLING", "CLOSING", "COMMUNICATION", "RESILIENCE", "PRODUCT_MASTERY"];

export default async function ComparePage({ searchParams }: { searchParams: { ids?: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR");
  const orgFilter = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };

  // Pool of AEs the caller can pick from
  const accessibleAes = await prisma.aeProfile.findMany({
    where: {
      ...orgFilter,
      ...(ctx.role === "DIRECTOR" ? { directorId: ctx.userId } : {}),
      ...(ctx.role === "VP_SALES"
        ? { director: { vpId: ctx.userId } }
        : {}),
      lastSynthesizedAt: { not: null },
    },
    include: { user: { select: { id: true, name: true, email: true, imageUrl: true } } },
    orderBy: { user: { name: "asc" } },
  });

  const selectedIds = (searchParams.ids ?? "").split(",").filter(Boolean).slice(0, 4);
  const selected = selectedIds.length > 0
    ? await prisma.aeProfile.findMany({
        where: {
          id: { in: selectedIds },
          ...orgFilter,
        },
        include: {
          user: { select: { id: true, name: true, email: true, imageUrl: true } },
          director: { select: { name: true } },
          skillScores: true,
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
        <h1 className="h-page mt-2">Compare AEs</h1>
        <p className="text-sm text-ink-muted mt-1">
          Pick 2-4 AEs to see them side-by-side. Useful for deciding who's ready for an expansion territory,
          who needs more discovery coaching, who works similarly to who.
        </p>
      </header>

      <CompareSelector
        pool={accessibleAes.map((a) => ({
          id: a.id,
          name: a.user.name,
          email: a.user.email,
          imageUrl: a.user.imageUrl,
        }))}
        selectedIds={selectedIds}
      />

      {orderedSelected.length === 0 ? (
        <div className="card p-12 text-center mt-6">
          <p className="text-sm text-ink-muted">Pick at least 2 AEs above to see the side-by-side view.</p>
        </div>
      ) : (
        <>
          {orderedSelected.length >= 2 && (
            <CompareNarrative
              aeIds={orderedSelected.map((a) => a.id)}
              aeNames={orderedSelected.map((a) => a.user.name)}
            />
          )}
          <div className="mt-5 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left">
                <th className="px-3 py-2 text-xs uppercase tracking-wider text-ink-muted font-semibold align-bottom w-44">Trait</th>
                {orderedSelected.map((ae) => (
                  <th key={ae.id} className="px-3 py-2 align-bottom min-w-[200px]">
                    <Link href={`/director/ae/${ae.id}`} className="block text-left hover:text-brand-indigo">
                      <div className="flex items-center gap-2 mb-1">
                        {ae.user.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ae.user.imageUrl} alt={ae.user.name} className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-xs font-bold">
                            {ae.user.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")}
                          </div>
                        )}
                        <div>
                          <div className="font-display font-bold">{ae.user.name}</div>
                          {ae.director?.name && <div className="meta">→ {ae.director.name}</div>}
                        </div>
                      </div>
                    </Link>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="border-t border-ink-softLine">
              {/* Personality stack */}
              <Row label="Enneagram" cells={orderedSelected.map((ae) => ae.enneagramType ?? "—")} mono />
              <Row label="DISC" cells={orderedSelected.map((ae) => ae.discProfile ?? "—")} mono />
              <Row label="MBTI" cells={orderedSelected.map((ae) => ae.mbtiType ?? "—")} mono />

              {/* Skill scores */}
              <SectionDivider label="Skills" />
              {SKILL_ORDER.map((cat) => (
                <Row
                  key={cat}
                  label={cat.replace(/_/g, " ").toLowerCase()}
                  capitalize
                  cells={orderedSelected.map((ae) => {
                    const s = ae.skillScores.find((x: any) => x.category === cat);
                    return s ? <ScoreBar score={s.score} key={ae.id} /> : "—";
                  })}
                />
              ))}
              <Row
                label="Avg skill"
                cells={orderedSelected.map((ae) => {
                  const scores = ae.skillScores;
                  if (scores.length === 0) return "—";
                  const avg = Math.round(scores.reduce((s: number, x: any) => s + x.score, 0) / scores.length);
                  return <span className="font-mono font-bold">{avg}</span>;
                })}
              />

              {/* Lists */}
              <SectionDivider label="Strengths" />
              <Row
                label="Top strengths"
                cells={orderedSelected.map((ae) => {
                  const s = (ae.strengthsJson as string[]) ?? [];
                  return (
                    <ul className="space-y-0.5 text-xs" key={ae.id}>
                      {s.slice(0, 4).map((x, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-brand-emerald">+</span>{x}
                        </li>
                      ))}
                    </ul>
                  );
                })}
              />

              <SectionDivider label="Growth areas" />
              <Row
                label="Top growth areas"
                cells={orderedSelected.map((ae) => {
                  const s = (ae.weaknessesJson as string[]) ?? [];
                  return (
                    <ul className="space-y-0.5 text-xs" key={ae.id}>
                      {s.slice(0, 4).map((x, i) => (
                        <li key={i} className="flex gap-1.5">
                          <span className="text-brand-amber">↗</span>{x}
                        </li>
                      ))}
                    </ul>
                  );
                })}
              />

              <SectionDivider label="Motivations" />
              <Row
                label="Drivers"
                cells={orderedSelected.map((ae) => {
                  const m = (ae.motivations as string[]) ?? [];
                  return (
                    <ul className="space-y-0.5 text-xs" key={ae.id}>
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
        </>
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
