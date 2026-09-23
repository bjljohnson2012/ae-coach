/**
 * /admin/analyze/full/[dimension]
 *
 * Comprehensive grid view: every value present in AeProfile/DirectorProfile data
 * for the requested dimension (Enneagram type, DISC, MBTI, or skill category),
 * with the people in each grouping. Dynamic — pulls live distinct values rather
 * than hardcoding the universe.
 *
 * Supported dimensions: enneagram, disc, mbti, skills
 */
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { PersonalityInfoButton } from "@/components/PersonalityInfoButton";
import { SkillInfoButton } from "@/components/SkillInfoButton";

const DIMENSIONS = ["enneagram", "disc", "mbti", "skills"] as const;
type Dimension = (typeof DIMENSIONS)[number];

const DIMENSION_LABELS: Record<Dimension, string> = {
  enneagram: "Enneagram",
  disc:      "DISC",
  mbti:      "MBTI",
  skills:    "Skills",
};

function isValidDimension(d: string): d is Dimension {
  return (DIMENSIONS as readonly string[]).includes(d);
}

interface Person {
  id: string;
  userId: string;
  name: string;
  email: string;
  imageUrl: string | null;
  role: "AE" | "DIRECTOR";
  directorName?: string | null;
  topSkill?: { category: string; score: number } | null;
  bottomSkill?: { category: string; score: number } | null;
}

export default async function FullDimensionPage({ params }: { params: { dimension: string } }) {
  if (!isValidDimension(params.dimension)) notFound();
  const dim = params.dimension as Dimension;

  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR");
  const orgFilter = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };

  // Load AE + director profiles with users + scores
  const [aes, directors] = await Promise.all([
    prisma.aeProfile.findMany({
      where: { ...orgFilter, lastSynthesizedAt: { not: null } },
      include: {
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
        director: { select: { name: true } },
        skillScores: { select: { category: true, score: true } },
      },
    }),
    prisma.directorProfile.findMany({
      where: { ...orgFilter, lastSynthesizedAt: { not: null } },
      include: {
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
        skillScores: { select: { category: true, score: true } },
      },
    }),
  ]);

  function topBottomSkill(scores: Array<{ category: string; score: number }>) {
    if (scores.length === 0) return { topSkill: null, bottomSkill: null };
    const sorted = [...scores].sort((a, b) => b.score - a.score);
    return { topSkill: sorted[0], bottomSkill: sorted[sorted.length - 1] };
  }

  // Build the dimension → people map dynamically
  const groups = new Map<string, Person[]>();

  if (dim === "enneagram" || dim === "disc" || dim === "mbti") {
    const field: keyof typeof aes[number] =
      dim === "enneagram" ? "enneagramType" :
      dim === "disc" ? "discProfile" : "mbtiType";

    for (const ae of aes) {
      const v = (ae as any)[field];
      if (!v) continue;
      const tb = topBottomSkill(ae.skillScores);
      const person: Person = {
        id: ae.id, userId: ae.user.id,
        name: ae.user.name, email: ae.user.email, imageUrl: ae.user.imageUrl,
        role: "AE",
        directorName: ae.director?.name ?? null,
        ...tb,
      };
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v)!.push(person);
    }
    for (const dp of directors) {
      const v = (dp as any)[field];
      if (!v) continue;
      const tb = topBottomSkill(dp.skillScores);
      const person: Person = {
        id: dp.id, userId: dp.user.id,
        name: dp.user.name, email: dp.user.email, imageUrl: dp.user.imageUrl,
        role: "DIRECTOR",
        ...tb,
      };
      if (!groups.has(v)) groups.set(v, []);
      groups.get(v)!.push(person);
    }
  } else if (dim === "skills") {
    // Group by skill category. Each person appears in EVERY skill they have a score in.
    for (const ae of aes) {
      for (const s of ae.skillScores) {
        const tb = topBottomSkill(ae.skillScores);
        const person: Person = {
          id: ae.id, userId: ae.user.id,
          name: ae.user.name, email: ae.user.email, imageUrl: ae.user.imageUrl,
          role: "AE",
          directorName: ae.director?.name ?? null,
          ...tb,
        };
        if (!groups.has(s.category)) groups.set(s.category, []);
        groups.get(s.category)!.push({ ...person, topSkill: s });
      }
    }
    for (const dp of directors) {
      for (const s of dp.skillScores) {
        const tb = topBottomSkill(dp.skillScores);
        const person: Person = {
          id: dp.id, userId: dp.user.id,
          name: dp.user.name, email: dp.user.email, imageUrl: dp.user.imageUrl,
          role: "DIRECTOR",
          ...tb,
        };
        if (!groups.has(s.category)) groups.set(s.category, []);
        groups.get(s.category)!.push({ ...person, topSkill: s });
      }
    }
  }

  // Sort. For Enneagram, force 1→9 ordering with empty buckets included so
  // the chart reads like the framework. Other dimensions sort by count desc.
  let groupEntries: Array<[string, Person[]]>;
  if (dim === "enneagram") {
    const order = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
    // Coalesce wing notations ("3w2") into the base type so the framework reads cleanly.
    const coalesced = new Map<string, Person[]>();
    for (const [k, v] of groups.entries()) {
      const base = k.trim().match(/^[1-9]/)?.[0] ?? k;
      if (!coalesced.has(base)) coalesced.set(base, []);
      coalesced.get(base)!.push(...v);
    }
    groupEntries = order.map((k): [string, Person[]] => [k, coalesced.get(k) ?? []]);
  } else {
    groupEntries = Array.from(groups.entries()).sort((a, b) => {
      if (b[1].length !== a[1].length) return b[1].length - a[1].length;
      return a[0].localeCompare(b[0]);
    });
  }

  const totalPeople = (dim === "skills"
    ? aes.length + directors.length
    : groupEntries.reduce((s, [, ps]) => s + ps.length, 0));

  return (
    <div className="page max-w-6xl">
      <Link href="/admin/analyze" className="link text-sm">← Analyze</Link>
      <header className="mt-2 mb-5 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow mb-1">Full breakdown</div>
          <h1 className="h-page">{DIMENSION_LABELS[dim]} — every {dim === "skills" ? "skill" : "type"}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {dim === "skills"
              ? `Score distribution per skill. ${totalPeople} synthesized profile${totalPeople === 1 ? "" : "s"}, sorted by skill coverage.`
              : `${groupEntries.length} type${groupEntries.length === 1 ? "" : "s"} present across ${totalPeople} synthesized profile${totalPeople === 1 ? "" : "s"}. Updates live as more profiles synthesize.`}
          </p>
        </div>
        <nav className="flex gap-1 flex-wrap">
          {DIMENSIONS.map((d) => (
            <Link
              key={d}
              href={`/admin/analyze/full/${d}`}
              className={`px-3 py-1.5 rounded-brand text-sm transition-colors ${
                d === dim ? "bg-brand-indigo text-white font-semibold" : "bg-ink-softLine/60 hover:bg-ink-softLine"
              }`}
            >
              {DIMENSION_LABELS[d]}
            </Link>
          ))}
        </nav>
      </header>

      {groupEntries.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-sm text-ink-muted">
            No data yet. Once profiles synthesize, this view will populate dynamically.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {groupEntries.map(([key, people]) => (
            <GroupCard key={key} dim={dim} groupKey={key} people={people} totalPeople={totalPeople} />
          ))}
        </div>
      )}
    </div>
  );
}

function GroupCard({ dim, groupKey, people, totalPeople }: { dim: Dimension; groupKey: string; people: Person[]; totalPeople: number }) {
  const pct = totalPeople > 0 ? Math.round((people.length / totalPeople) * 100) : 0;
  const headerLabel = dim === "skills"
    ? groupKey.replace(/_/g, " ")
    : groupKey;

  // Color for group accent — by dim
  const accent =
    dim === "enneagram" ? "from-brand-orange to-brand-amber" :
    dim === "disc" ? "from-brand-indigo to-brand-indigoDeep" :
    dim === "mbti" ? "from-brand-emerald to-brand-indigo" :
    "from-brand-navy to-brand-indigo";

  // For skills, sort by score within the group
  const sortedPeople = dim === "skills"
    ? [...people].sort((a, b) => (b.topSkill?.score ?? 0) - (a.topSkill?.score ?? 0))
    : people;

  // Map dimension → info button (skill or personality framework). The pill
  // sits on a saturated gradient header — onDarkBg gives it a high-contrast
  // white surface for ADA AA legibility.
  const infoButton = (() => {
    const common = { triggerLabel: "Learn more", onDarkBg: true };
    if (dim === "skills") return <SkillInfoButton category={groupKey} {...common} />;
    if (dim === "enneagram") return <PersonalityInfoButton framework="ENNEAGRAM" code={groupKey} {...common} />;
    if (dim === "disc") return <PersonalityInfoButton framework="DISC" code={groupKey} {...common} />;
    if (dim === "mbti") return <PersonalityInfoButton framework="MBTI" code={groupKey} {...common} />;
    return null;
  })();

  return (
    <div className="card overflow-hidden">
      <header className={`px-4 py-3 bg-gradient-to-r ${accent} text-white`}>
        <div className="flex items-center justify-between gap-2 mb-1.5">
          <div className="font-display font-bold text-lg truncate">{headerLabel}</div>
          <div className="text-right shrink-0">
            <div className="text-2xl font-display font-bold leading-none">{people.length}</div>
            <div className="text-[10px] opacity-80">{pct}% of total</div>
          </div>
        </div>
        {/* Learn-more pill on its own row so it never gets cropped — the
            popover itself portals to document.body so it's never clipped. */}
        {infoButton}
      </header>
      <ul className="divide-y divide-ink-softLine">
        {sortedPeople.map((p) => (
          <li key={`${p.id}-${dim}-${groupKey}`}>
            <Link
              href={p.role === "AE" ? `/director/ae/${p.id}` : `/director/director/${p.id}`}
              className="px-3 py-2 flex items-center gap-2.5 hover:bg-brand-indigo/5 transition-colors"
            >
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.name} className="w-8 h-8 rounded-full object-cover ring-1 ring-ink-softLine shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                  {p.name.split(" ").map((q) => q[0]).filter(Boolean).slice(0, 2).join("")}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {p.name}
                  <span className="ml-1.5 text-[9px] uppercase tracking-wider font-bold px-1 py-0.5 rounded bg-ink-softLine text-ink-slate">
                    {p.role === "AE" ? "AE" : "DIR"}
                  </span>
                </div>
                <div className="meta truncate">
                  {dim === "skills" && p.topSkill ? (
                    <span className="font-mono">score {p.topSkill.score}</span>
                  ) : p.directorName ? (
                    <>under {p.directorName}</>
                  ) : (
                    p.email
                  )}
                </div>
              </div>
              {dim === "skills" && p.topSkill && (
                <div className="w-12 h-1.5 bg-ink-softLine rounded-full overflow-hidden shrink-0">
                  <div
                    className="h-full"
                    style={{
                      width: `${p.topSkill.score}%`,
                      background: p.topSkill.score >= 80 ? "#0E9F6E" : p.topSkill.score >= 60 ? "#1F3C88" : p.topSkill.score >= 40 ? "#F59E0B" : "#DC2626",
                    }}
                  />
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
