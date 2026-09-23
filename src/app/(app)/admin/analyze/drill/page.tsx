/**
 * /admin/analyze/drill?kind=personality&type=ENNEAGRAM&value=9
 * /admin/analyze/drill?kind=skill&category=DISCOVERY&min=0&max=40
 *
 * Filterable AE list. Lets directors/VPs/admins drill from any cell on the
 * Analyze page into "show me everyone with X."
 */
import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";

export default async function AnalyzeDrillPage({
  searchParams,
}: {
  searchParams: { kind?: string; type?: string; value?: string; category?: string; min?: string; max?: string };
}) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR");
  const orgFilter = ctx.role === "ORG_ADMIN" ? {} : { orgId: ctx.effectiveOrgId };

  const kind = searchParams.kind ?? "personality";
  const min = Number(searchParams.min ?? 0);
  const max = Number(searchParams.max ?? 100);

  let title = "AEs";
  let subtitle = "";
  let aes: any[] = [];

  if (kind === "personality") {
    const type = (searchParams.type ?? "ENNEAGRAM").toUpperCase();
    const value = searchParams.value ?? "";
    title = `${type} = ${value}`;
    subtitle = `AEs whose intake synthesis identified them as ${type} ${value}.`;

    const field =
      type === "ENNEAGRAM" ? "enneagramType" :
      type === "DISC" ? "discProfile" :
      type === "MBTI" ? "mbtiType" : "enneagramType";

    aes = await prisma.aeProfile.findMany({
      where: {
        ...orgFilter,
        [field]: value,
      },
      include: {
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
        director: { select: { name: true } },
        skillScores: { select: { category: true, score: true } },
      },
      orderBy: { user: { name: "asc" } },
    });
  } else if (kind === "skill") {
    const category = (searchParams.category ?? "DISCOVERY").toUpperCase();
    title = `${category.replace(/_/g, " ")} score ${min}–${max}`;
    subtitle = `AEs whose ${category.replace(/_/g, " ").toLowerCase()} score falls in this band.`;

    aes = await prisma.aeProfile.findMany({
      where: {
        ...orgFilter,
        skillScores: {
          some: {
            category: category as any,
            score: { gte: min, lte: max },
          },
        },
      },
      include: {
        user: { select: { id: true, name: true, email: true, imageUrl: true } },
        director: { select: { name: true } },
        skillScores: { select: { category: true, score: true } },
      },
      orderBy: { user: { name: "asc" } },
    });
  }

  return (
    <div className="page max-w-4xl">
      <Link href="/admin/analyze" className="link text-sm">← Analyze</Link>
      <header className="mt-2 mb-5">
        <div className="eyebrow mb-1">Drill-in</div>
        <h1 className="h-page">{title}</h1>
        <p className="text-sm text-ink-muted mt-1">{subtitle}</p>
      </header>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-ink-softLine bg-surface-soft flex items-center justify-between">
          <span className="font-display font-semibold">{aes.length} AE{aes.length === 1 ? "" : "s"}</span>
          {kind === "skill" && (
            <BandSelector category={searchParams.category ?? "DISCOVERY"} min={min} max={max} />
          )}
        </div>
        {aes.length === 0 ? (
          <div className="p-8 text-center text-sm text-ink-muted">No AEs match this filter.</div>
        ) : (
          <ul className="divide-y divide-ink-softLine">
            {aes.map((ae: any) => {
              const score = kind === "skill"
                ? ae.skillScores.find((s: any) => s.category === (searchParams.category ?? "DISCOVERY").toUpperCase())?.score
                : null;
              return (
                <li key={ae.id} className="px-5 py-3 flex items-center gap-3">
                  {ae.user.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={ae.user.imageUrl} alt={ae.user.name} className="w-10 h-10 rounded-full object-cover ring-1 ring-ink-softLine" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-sm font-bold">
                      {ae.user.name.split(" ").map((p: string) => p[0]).filter(Boolean).slice(0, 2).join("")}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <Link href={`/director/ae/${ae.id}`} className="font-medium text-ink hover:underline">
                      {ae.user.name}
                    </Link>
                    <div className="meta">
                      {ae.user.email}
                      {ae.director?.name && <> · reports to {ae.director.name}</>}
                    </div>
                  </div>
                  {score !== null && score !== undefined && (
                    <div className="text-right">
                      <div className="font-mono font-bold">{score}</div>
                      <div className="meta">/ 100</div>
                    </div>
                  )}
                  <Link href={`/director/ae/${ae.id}`} className="btn-ghost text-xs">Open →</Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function BandSelector({ category, min, max }: { category: string; min: number; max: number }) {
  const bands: Array<[number, number, string]> = [
    [0, 39, "0–39 (urgent)"],
    [40, 59, "40–59"],
    [60, 79, "60–79"],
    [80, 100, "80–100 (strength)"],
  ];
  return (
    <div className="flex gap-1 flex-wrap">
      {bands.map(([lo, hi, label]) => {
        const active = min === lo && max === hi;
        return (
          <Link
            key={`${lo}-${hi}`}
            href={`/admin/analyze/drill?kind=skill&category=${category}&min=${lo}&max=${hi}`}
            className={`text-xs px-2 py-1 rounded-brand transition-colors ${
              active ? "bg-brand-indigo text-white" : "bg-ink-softLine/60 hover:bg-ink-softLine"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
