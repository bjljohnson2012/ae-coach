import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { AnalyzeDrillTrigger } from "../analyze/AnalyzeDrillTrigger";

export default async function ReportsPage() {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const orgFilter = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };

  // Personality distributions
  const profiles = await prisma.aeProfile.findMany({
    where: { ...orgFilter, lastSynthesizedAt: { not: null } },
    select: { enneagramType: true, discProfile: true, mbtiType: true },
  });

  function tally(items: (string | null)[]) {
    const m = new Map<string, number>();
    for (const v of items) {
      if (!v) continue;
      m.set(v, (m.get(v) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }
  const enneagram = tally(profiles.map((p) => p.enneagramType));
  const disc = tally(profiles.map((p) => p.discProfile));
  const mbti = tally(profiles.map((p) => p.mbtiType));

  // Skill distribution buckets
  const allScores = await prisma.skillScore.findMany({
    where: { aeProfile: orgFilter },
    select: { category: true, score: true },
  });
  const skillBy: Record<string, { sum: number; n: number; min: number; max: number; b0_40: number; b40_60: number; b60_80: number; b80_100: number }> = {};
  for (const s of allScores) {
    const k = s.category;
    skillBy[k] ??= { sum: 0, n: 0, min: 100, max: 0, b0_40: 0, b40_60: 0, b60_80: 0, b80_100: 0 };
    const cur = skillBy[k];
    cur.sum += s.score; cur.n += 1;
    cur.min = Math.min(cur.min, s.score); cur.max = Math.max(cur.max, s.score);
    if (s.score < 40) cur.b0_40++;
    else if (s.score < 60) cur.b40_60++;
    else if (s.score < 80) cur.b60_80++;
    else cur.b80_100++;
  }

  // Roster snapshot
  const aeCount = profiles.length;
  const totalAes = await prisma.aeProfile.count({ where: orgFilter });
  const pendingIntake = totalAes - aeCount;

  return (
    <div className="page">
      <Link href="/admin/analyze" className="link text-sm">← Analyze</Link>
      <header className="mt-2 mb-6">
        <div className="eyebrow mb-2">Reports</div>
        <h1 className="h-page">Personality + Skill Reports</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Aggregated view of your team's profile distribution and skill coverage.
          {ctx.role === "ORG_ADMIN" ? " Cross-org." : " Your org only."}
        </p>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="AEs synthesized" value={aeCount} />
        <Stat label="AEs pending intake" value={pendingIntake} />
        <Stat label="Total AEs" value={totalAes} />
        <Stat label="Skill data points" value={allScores.length} />
      </section>

      <h2 className="h-section mb-3">Personality distribution</h2>
      <section className="grid sm:grid-cols-3 gap-4 mb-6">
        <DistCard title="Enneagram" type="ENNEAGRAM" seeAllHref="/admin/analyze/full/enneagram" rows={enneagram} total={aeCount} />
        <DistCard title="DISC" type="DISC" seeAllHref="/admin/analyze/full/disc" rows={disc} total={aeCount} />
        <DistCard title="MBTI" type="MBTI" seeAllHref="/admin/analyze/full/mbti" rows={mbti} total={aeCount} />
      </section>

      <div className="flex items-center justify-between mb-3 gap-3">
        <h2 className="h-section">Skill coverage</h2>
        <Link href="/admin/analyze/full/skills" className="text-xs link">See all →</Link>
      </div>
      <section className="card overflow-hidden mb-6">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-ink-muted bg-surface-soft">
            <tr>
              <th className="px-5 py-2.5 font-semibold">Skill</th>
              <th className="px-5 py-2.5 font-semibold text-right">Avg</th>
              <th className="px-5 py-2.5 font-semibold text-right">Range</th>
              <th className="px-5 py-2.5 font-semibold text-right">n</th>
              <th className="px-5 py-2.5 font-semibold">Distribution</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(skillBy).map(([cat, c]) => {
              const avg = c.n > 0 ? Math.round(c.sum / c.n) : 0;
              const bands: Array<[number, number, string, number]> = [
                [0, 39, "#DC2626", c.b0_40],
                [40, 59, "#F59E0B", c.b40_60],
                [60, 79, "#1F3C88", c.b60_80],
                [80, 100, "#0E9F6E", c.b80_100],
              ];
              return (
                <tr key={cat} className="border-t border-ink-softLine">
                  <td className="px-5 py-3 font-semibold">
                    <AnalyzeDrillTrigger kind="skill" category={cat} min={0} max={100}>
                      <span className="hover:text-brand-indigo cursor-pointer">{cat.replace(/_/g, " ")}</span>
                    </AnalyzeDrillTrigger>
                  </td>
                  <td className="px-5 py-3 text-right font-mono">{avg}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink-muted">{c.min}–{c.max}</td>
                  <td className="px-5 py-3 text-right font-mono text-ink-muted">{c.n}</td>
                  <td className="px-5 py-3">
                    <div className="flex h-3 rounded overflow-hidden bg-ink-softLine/40">
                      {bands.map(([lo, hi, color, v], i) => (
                        <AnalyzeDrillTrigger key={i} kind="skill" category={cat} min={lo} max={hi}>
                          <div style={{ flex: v, background: color, minWidth: v ? 4 : 0, height: 12, cursor: v > 0 ? "pointer" : "default" }} title={`${lo}–${hi}: ${v} AE${v === 1 ? "" : "s"}`} />
                        </AnalyzeDrillTrigger>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="meta">
        Color key: <span className="text-brand-red font-semibold">red</span> 0–39 (urgent gap) ·{" "}
        <span className="text-brand-amber font-semibold">amber</span> 40–59 ·{" "}
        <span className="text-brand-indigo font-semibold">indigo</span> 60–79 ·{" "}
        <span className="text-brand-emerald font-semibold">emerald</span> 80–100 (strength)
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="eyebrow">{label}</div>
      <div className="font-display text-3xl font-bold mt-1">{value}</div>
    </div>
  );
}

function DistCard({ title, type, seeAllHref, rows, total }: { title: string; type?: string; seeAllHref?: string; rows: Array<[string, number]>; total: number }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="eyebrow">{title}</div>
        {seeAllHref && (
          <Link href={seeAllHref} className="text-xs link">See all →</Link>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-muted">No data yet — synthesize some profiles first.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {rows.slice(0, 10).map(([k, n]) => {
            const pct = total > 0 ? Math.round((n / total) * 100) : 0;
            const inner = (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="font-mono">{k}</span>
                  <span className="meta">{n} ({pct}%)</span>
                </div>
                <div className="mt-1 h-1.5 bg-ink-softLine/60 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-indigo" style={{ width: `${pct}%` }} />
                </div>
              </>
            );
            return (
              <li key={k}>
                {type ? (
                  <AnalyzeDrillTrigger kind="personality" type={type} value={k}>
                    <div className="hover:bg-brand-indigo/5 rounded-brand px-1 -mx-1 py-0.5">{inner}</div>
                  </AnalyzeDrillTrigger>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
