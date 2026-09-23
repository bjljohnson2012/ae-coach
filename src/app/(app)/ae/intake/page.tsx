import { redirect } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { IntakeWizardClient } from "./IntakeWizardClient";

/**
 * AE intake landing.
 * - First-time AE: starts the wizard immediately.
 * - Has IN_PROGRESS set: resumes the wizard.
 * - Has COMPLETED set + ?retake=1 query: starts a fresh new version.
 * - Has COMPLETED set + no retake: shows "you've completed this" + retake CTA.
 */
export default async function IntakePage({ searchParams }: { searchParams: { retake?: string } }) {
  const ctx = await requireRole("AE");
  const ae = await prisma.aeProfile.findUnique({
    where: { userId: ctx.userId },
    include: {
      answerSets: { orderBy: { startedAt: "desc" } },
    },
  });
  if (!ae) redirect("/login");

  const inProgress = ae.answerSets.find((s) => s.status === "IN_PROGRESS");
  const completed = ae.answerSets.filter((s) => s.status === "COMPLETED");
  const wantsRetake = searchParams?.retake === "1";

  // Start/resume the wizard if (a) explicit retake, (b) something in-progress, (c) no prior completion.
  if (wantsRetake || inProgress || completed.length === 0) {
    return <IntakeWizardClient aeName={ctx.name} />;
  }

  // Show the "you've completed this" landing with retake CTA + recent history
  const latest = completed[0];
  return (
    <div className="page max-w-3xl">
      <header className="mb-6">
        <div className="eyebrow mb-2">Intake</div>
        <h1 className="h-page">You've already completed your intake.</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Your last intake was submitted {latest.completedAt?.toLocaleDateString() ?? "—"} (v{latest.version}).
          You can retake it anytime — your card and skill scores will re-synthesize from the new answers.
        </p>
      </header>

      <section className="card p-5 mb-4">
        <div className="eyebrow mb-2">Past intake submissions</div>
        <ul className="space-y-1.5 text-sm">
          {completed.map((s) => (
            <li key={s.id} className="flex justify-between gap-3">
              <span>v{s.version} · {s.completedAt?.toLocaleDateString() ?? "—"}</span>
              <span className="meta">{s.questionOrder ? (s.questionOrder as string[]).length : 0} questions</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex gap-2 flex-wrap">
        <Link href="/ae/intake?retake=1" className="btn-primary">↺ Retake intake</Link>
        <Link href="/ae/card" className="btn-ghost">← Back to my card</Link>
      </div>
    </div>
  );
}
