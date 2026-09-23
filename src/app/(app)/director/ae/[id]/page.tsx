import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { CoachingNoteForm } from "./CoachingNoteForm";
import { AeTabs } from "./AeTabs";
import { PerformanceTab } from "./PerformanceTab";
import { PrepTab } from "./PrepTab";
import { ChatTab } from "./ChatTab";
import { OverviewWithDrills } from "./OverviewWithDrills";
import { GenerateTasksButton } from "./GenerateTasksButton";
import { SendQuizButton } from "./SendQuizButton";
import { ReasoningTab } from "./ReasoningTab";
import { QuizScheduleCard } from "./QuizScheduleCard";
import { IntakeQuizzesTab } from "./IntakeQuizzesTab";
import { PersonalityChip } from "@/components/PersonalityChip";
import { discExplainer, enneagramExplainer, mbtiExplainer } from "@/lib/personalityExplainers";
import { CoachingPlansTab } from "@/components/CoachingPlansTab";
import { CoachingHintsTab } from "./CoachingHintsTab";
import { ProfileCardTrigger } from "@/components/ProfileCardDrawer";
import { GenerateTasksForUserButton } from "@/components/GenerateTasksForUserButton";

export default async function DirectorAeDetail({ params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) notFound();

  const ae = await prisma.aeProfile.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, email: true, imageUrl: true, status: true } },
      skillScores: true,
      coachingNotes: { orderBy: { createdAt: "desc" }, include: { director: { select: { name: true } } } },
      director: { select: { name: true } },
    },
  });
  if (!ae) notFound();

  const strengths = (ae.strengthsJson as string[]) ?? [];
  const weaknesses = (ae.weaknessesJson as string[]) ?? [];
  const motivations = (ae.motivations as string[]) ?? [];

  // Coaching plan unread count — drives the lit-up tab badge.
  const allAePlans = await prisma.coachingPlan.findMany({
    where: { aeProfileId: ae.id, status: "READY" as any },
    select: { id: true, readByJson: true },
  });
  const aeUnreadPlanCount = allAePlans.filter((p: any) => {
    const arr = Array.isArray(p.readByJson) ? (p.readByJson as string[]) : [];
    return !arr.includes(ae.user.id);
  }).length;

  const overview = (
    <div className="space-y-5">
      {!ae.lastSynthesizedAt ? (
        <div className="card p-5 bg-brand-amber/5 border-brand-amber/30">
          <p className="text-sm">
            This AE hasn't completed the intake wizard yet. They should go to <code>/ae/intake</code> after logging in.
          </p>
        </div>
      ) : (
        <>
          <OverviewWithDrills
            aeProfileId={ae.id}
            scores={ae.skillScores.map((s) => ({ category: s.category, score: s.score, level: s.level }))}
            enneagramType={ae.enneagramType}
            discProfile={ae.discProfile}
            mbtiType={ae.mbtiType}
          />

          {/* Personality explainers — what each type means in general (separate
              from the per-AE reasoning drill-in above). Click any chip for a
              full breakdown of strengths, watch-outs, and how to coach this type. */}
          {(ae.enneagramType || ae.discProfile || ae.mbtiType) && (
            <section className="card p-5">
              <div className="eyebrow mb-2">What these types mean</div>
              <p className="text-xs text-ink-muted mb-3">
                Click any type for an explainer of strengths, watch-outs, and coaching guidance.
              </p>
              <div className="flex flex-wrap gap-2">
                {ae.enneagramType && (
                  <PersonalityChip
                    framework="ENNEAGRAM"
                    rawCode={ae.enneagramType}
                    explanation={enneagramExplainer(ae.enneagramType)}
                  />
                )}
                {ae.discProfile && (
                  <PersonalityChip
                    framework="DISC"
                    rawCode={ae.discProfile}
                    explanation={discExplainer(ae.discProfile)}
                  />
                )}
                {ae.mbtiType && (
                  <PersonalityChip
                    framework="MBTI"
                    rawCode={ae.mbtiType}
                    explanation={mbtiExplainer(ae.mbtiType)}
                  />
                )}
              </div>
            </section>
          )}

          {ctx.role !== "AE" && <QuizScheduleCard aeProfileId={ae.id} name={ae.user.name} kind="ae" />}

          <div className="grid sm:grid-cols-2 gap-4">
            <ProfileCardTrigger userId={ae.user.id} field="strengths">
              <div className="eyebrow mb-2">Strengths</div>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {strengths.map((s, i) => <li key={i}>{s}</li>)}
                {strengths.length === 0 && <li className="text-ink-muted list-none">None recorded.</li>}
              </ul>
            </ProfileCardTrigger>
            <ProfileCardTrigger userId={ae.user.id} field="weaknesses">
              <div className="eyebrow mb-2">Growth areas</div>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {weaknesses.map((s, i) => <li key={i}>{s}</li>)}
                {weaknesses.length === 0 && <li className="text-ink-muted list-none">None recorded.</li>}
              </ul>
            </ProfileCardTrigger>
          </div>

          {ae.personalitySummary && (
            <ProfileCardTrigger userId={ae.user.id} field="personality">
              <div className="eyebrow mb-2">Personality summary</div>
              <p className="text-sm whitespace-pre-wrap">{ae.personalitySummary}</p>
            </ProfileCardTrigger>
          )}
          {ae.salesStyleSummary && (
            <ProfileCardTrigger userId={ae.user.id} field="salesStyle">
              <div className="eyebrow mb-2">Sales style</div>
              <p className="text-sm whitespace-pre-wrap">{ae.salesStyleSummary}</p>
            </ProfileCardTrigger>
          )}
          {ae.communicationSummary && (
            <ProfileCardTrigger userId={ae.user.id} field="communication">
              <div className="eyebrow mb-2">Communication style</div>
              <p className="text-sm whitespace-pre-wrap">{ae.communicationSummary}</p>
            </ProfileCardTrigger>
          )}
          {motivations.length > 0 && (
            <ProfileCardTrigger userId={ae.user.id} field="motivations">
              <div className="eyebrow mb-2">Motivations</div>
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {motivations.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </ProfileCardTrigger>
          )}
        </>
      )}

      <div className="card p-5">
        <div className="eyebrow mb-3">Coaching notes</div>
        <CoachingNoteForm aeProfileId={ae.id} />
        <ul className="mt-4 space-y-3 text-sm">
          {ae.coachingNotes.map((n) => (
            <li key={n.id} className="border-l-2 border-brand-orange/60 pl-3">
              <div className="text-xs text-ink-muted">
                {n.createdAt.toLocaleDateString()} · {n.director.name}
                {n.visibleToAe ? <span className="ml-2 text-brand-emerald">visible to AE</span> : <span className="ml-2 text-ink-muted">private</span>}
              </div>
              <p className="whitespace-pre-wrap">{n.content}</p>
            </li>
          ))}
          {ae.coachingNotes.length === 0 && <li className="text-ink-muted list-none">No notes yet.</li>}
        </ul>
      </div>
    </div>
  );

  return (
    <div className="page max-w-5xl">
      <header className="mb-4">
        <Link href="/dashboard" className="link text-sm">← Dashboard</Link>
        <div className="flex items-center gap-4 mt-2">
          {ae.user.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ae.user.imageUrl} alt={ae.user.name} className="w-16 h-16 rounded-full object-cover ring-2 ring-ink-softLine" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-brand-indigo to-brand-orange flex items-center justify-center text-white text-lg font-bold">
              {ae.user.name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("")}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="h-page truncate">{ae.user.name}</h1>
            <p className="text-sm text-ink-muted">
              {ae.user.email} · {ae.user.status}
              {ae.director?.name && <span> · reports to {ae.director.name}</span>}
            </p>
          </div>
          <div className="shrink-0 flex flex-col gap-1.5">
            <SendQuizButton aeProfileId={ae.id} aeName={ae.user.name} />
            <GenerateTasksForUserButton
              preselectedUserId={ae.user.id}
              buttonLabel="✨ Generate tasks"
              buttonClassName="btn-secondary text-xs"
            />
          </div>
        </div>
      </header>

      <AeTabs
        overview={overview}
        performance={<PerformanceTab aeProfileId={ae.id} />}
        intake={<IntakeQuizzesTab aeProfileId={ae.id} viewerRole={ctx.role} />}
        prep={<PrepTab aeProfileId={ae.id} aeName={ae.user.name} />}
        chat={<ChatTab aeProfileId={ae.id} aeName={ae.user.name} />}
        hints={ctx.role !== "AE" && ctx.userId !== ae.user.id ? <CoachingHintsTab userId={ae.user.id} aeProfileId={ae.id} /> : undefined}
        reasoning={ctx.role !== "AE" ? <ReasoningTab aeProfileId={ae.id} /> : undefined}
        plans={<CoachingPlansTab userId={ae.user.id} viewerId={ctx.userId} />}
        unreadPlans={aeUnreadPlanCount}
      />
    </div>
  );
}

