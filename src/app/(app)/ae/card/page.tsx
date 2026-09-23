import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SkillCard } from "@/components/SkillCard";
import { getImproveButtonLabel } from "@/lib/improve";
import { SynthesisStatusBanner } from "@/components/SynthesisStatusBanner";

export default async function AeCardPage() {
  const ctx = await requireRole("AE");

  const ae = await prisma.aeProfile.findUnique({
    where: { userId: ctx.userId },
    include: {
      user: { select: { name: true, email: true, imageUrl: true } },
      skillScores: true,
      coachingNotes: { where: { visibleToAe: true }, orderBy: { createdAt: "desc" }, take: 5 },
      recommendations: {
        where: { routeTo: "AE", status: "OPEN" },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });
  if (!ae) redirect("/login");

  // v3.37.5 — initial banner state for the polling component.
  // v3.37.6 — also detect orphaned state for users stranded by the legacy
  // synchronous flow.
  const aeAny = ae as any;
  let synthesisInitial: any = null;
  if (aeAny.synthesisStatus) {
    synthesisInitial = {
      status: aeAny.synthesisStatus as "GENERATING" | "FAILED" | "READY" | null,
      error: aeAny.synthesisError ?? null,
      startedAt: aeAny.synthesisStartedAt ? new Date(aeAny.synthesisStartedAt).toISOString() : null,
      ageSeconds: aeAny.synthesisStartedAt
        ? Math.floor((Date.now() - new Date(aeAny.synthesisStartedAt).getTime()) / 1000)
        : 0,
      isOrphaned: false,
    };
  } else if (!ae.lastSynthesizedAt) {
    const orphanCheck = await prisma.answerSet.findFirst({
      where: { aeProfileId: ae.id, status: "COMPLETED" },
      select: { id: true },
    });
    if (orphanCheck) {
      synthesisInitial = {
        status: null,
        error: "Your intake was submitted but the AI didn't finish building your profile.",
        startedAt: null,
        ageSeconds: 0,
        isOrphaned: true,
      };
    }
  }

  // Empty state — no synthesis yet. Three flavors:
  //   1. GENERATING (just submitted, AI running) → banner only, no wireframe
  //   2. FAILED or ORPHANED (legacy stuck state) → banner with retry
  //   3. Not started → existing wireframe + Start intake CTA
  if (!ae.lastSynthesizedAt) {
    if (synthesisInitial?.status === "GENERATING" || synthesisInitial?.status === "FAILED" || synthesisInitial?.isOrphaned) {
      return (
        <div className="page">
          <header className="mb-6">
            <div className="eyebrow mb-2">Almost there</div>
            <h1 className="h-page">Hey {ctx.name.split(" ")[0]} — your card is being built.</h1>
          </header>
          <SynthesisStatusBanner initial={synthesisInitial} role={ctx.role} />
        </div>
      );
    }
    return (
      <div className="page">
        <header className="mb-8">
          <div className="eyebrow mb-2">Welcome aboard</div>
          <h1 className="h-page">Hey {ctx.name.split(" ")[0]} — your card is almost ready.</h1>
          <p className="mt-1.5 text-sm text-ink-muted max-w-2xl">
            Complete the intake wizard and we'll synthesize your personality, sales style,
            and skill scores in seconds. Here's a preview of what your card will look like.
          </p>
          <Link href="/ae/intake" className="btn-primary mt-5 inline-flex">
            Start your intake →
          </Link>
        </header>

        {/* Wireframe overlay */}
        <div className="relative">
          <div className="opacity-30 pointer-events-none select-none">
            <SkillCard
              ae={{
                ...({} as any),
                userId: ctx.userId,
                orgId: "",
                directorId: null,
                hireDate: null,
                photoUrl: null,
                headline: "Your tagline appears here",
                bioShort: null,
                personalitySummary: "We'll capture how you naturally think, decide, and connect — drawn from your intake answers.",
                salesStyleSummary: "Your sales style narrative — relationship-driven, technical, consultative, or some unique blend — appears here.",
                communicationSummary: "How you prefer to communicate, where you shine, and where to stretch.",
                motivations: [],
                strengthsJson: [],
                weaknessesJson: [],
                enneagramType: "—",
                discProfile: "—",
                mbtiType: "—",
                lastSynthesizedAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
                user: {
                  name: ctx.name,
                  email: ctx.email,
                  imageUrl: null,
                },
              }}
              scores={[
                { id: "1", aeProfileId: "x", category: "DISCOVERY", score: 65, level: 3, notes: null, source: "AI", lastUpdatedByUserId: null, lastUpdatedAt: new Date(), createdAt: new Date() },
                { id: "2", aeProfileId: "x", category: "OBJECTION_HANDLING", score: 55, level: 3, notes: null, source: "AI", lastUpdatedByUserId: null, lastUpdatedAt: new Date(), createdAt: new Date() },
                { id: "3", aeProfileId: "x", category: "CLOSING", score: 60, level: 3, notes: null, source: "AI", lastUpdatedByUserId: null, lastUpdatedAt: new Date(), createdAt: new Date() },
                { id: "4", aeProfileId: "x", category: "COMMUNICATION", score: 70, level: 4, notes: null, source: "AI", lastUpdatedByUserId: null, lastUpdatedAt: new Date(), createdAt: new Date() },
                { id: "5", aeProfileId: "x", category: "RESILIENCE", score: 50, level: 3, notes: null, source: "AI", lastUpdatedByUserId: null, lastUpdatedAt: new Date(), createdAt: new Date() },
                { id: "6", aeProfileId: "x", category: "PRODUCT_MASTERY", score: 45, level: 3, notes: null, source: "AI", lastUpdatedByUserId: null, lastUpdatedAt: new Date(), createdAt: new Date() },
              ] as any}
            />
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-card shadow-cardHover px-5 py-4 border border-ink-softLine flex items-center gap-3 pointer-events-auto">
              <span className="text-2xl">✨</span>
              <div>
                <div className="font-semibold text-sm">Preview only</div>
                <div className="text-xs text-ink-muted">Complete intake to fill this in for real.</div>
              </div>
              <Link href="/ae/intake" className="btn-primary text-xs">Start intake</Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const strengths = (ae.strengthsJson as string[]) ?? [];
  const weaknesses = (ae.weaknessesJson as string[]) ?? [];
  const motivations = (ae.motivations as string[]) ?? [];

  // v3.37 — per-org "Improve" button label.
  const improveLabel = await getImproveButtonLabel(ae.orgId);

  return (
    <div className="page space-y-6">
      {/* Banner only renders when GENERATING or FAILED — covers the case
          where someone retakes intake while their old card is on screen. */}
      {synthesisInitial && (synthesisInitial.status === "GENERATING" || synthesisInitial.status === "FAILED") && (
        <SynthesisStatusBanner initial={synthesisInitial} role={ctx.role} />
      )}
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="eyebrow mb-2">Your skill card</div>
          <h1 className="h-page">{greeting(ctx.name)}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Updated {ae.lastSynthesizedAt.toLocaleDateString()} · synthesized from your intake.
          </p>
        </div>
        <Link href="/improve" className="btn-primary text-sm whitespace-nowrap">
          ✨ {improveLabel}
        </Link>
      </header>

      <SkillCard ae={ae as any} scores={ae.skillScores} improveLabel={improveLabel} />

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <div className="eyebrow mb-2">Strengths</div>
          <ul className="space-y-1.5 text-sm">
            {strengths.length > 0
              ? strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-brand-emerald font-bold">+</span>{s}</li>)
              : <li className="text-ink-muted">—</li>}
          </ul>
        </div>
        <div className="card p-5">
          <div className="eyebrow mb-2">Growth Areas</div>
          <ul className="space-y-1.5 text-sm">
            {weaknesses.length > 0
              ? weaknesses.map((s, i) => <li key={i} className="flex gap-2"><span className="text-brand-amber font-bold">↗</span>{s}</li>)
              : <li className="text-ink-muted">—</li>}
          </ul>
        </div>
        <div className="card p-5">
          <div className="eyebrow mb-2">Motivations</div>
          <ul className="space-y-1.5 text-sm">
            {motivations.length > 0
              ? motivations.map((s, i) => <li key={i} className="flex gap-2"><span className="text-brand-indigo font-bold">→</span>{s}</li>)
              : <li className="text-ink-muted">—</li>}
          </ul>
        </div>
      </section>

      {ae.recommendations.length > 0 && (
        <section className="card p-6">
          <div className="eyebrow mb-3">Recommendations for you</div>
          <ul className="space-y-3">
            {ae.recommendations.map((r) => (
              <li key={r.id} className="border-l-2 border-brand-orange pl-4 py-1">
                <div className="meta">{r.category.replace("_", " ")}</div>
                <div className="font-display font-semibold text-ink mt-0.5">{r.title}</div>
                <p className="text-sm text-ink-slate mt-1 leading-relaxed">{r.description}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ae.coachingNotes.length > 0 && (
        <section className="card p-6">
          <div className="eyebrow mb-3">From your director</div>
          <ul className="space-y-3">
            {ae.coachingNotes.map((n) => (
              <li key={n.id} className="border-l-2 border-brand-indigo pl-4 py-1">
                <div className="meta">{n.createdAt.toLocaleDateString()}</div>
                <p className="text-sm text-ink-slate mt-1 whitespace-pre-wrap leading-relaxed">{n.content}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function greeting(name: string) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${name.split(" ")[0]}.`;
}
