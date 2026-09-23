/**
 * /ae/quizzes — AE-side view of all quizzes they've been sent.
 * Compressed list, expandable per quiz. Includes "Request Retake" on completed.
 */
import Link from "next/link";
import { requireRole } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { IntakeAndQuizzesView } from "./IntakeAndQuizzesView";

export default async function AeQuizzesPage() {
  const ctx = await requireRole("AE");

  const ae = await prisma.aeProfile.findUnique({
    where: { userId: ctx.userId },
    include: {
      answerSets: {
        orderBy: { startedAt: "desc" },
        include: {
          answers: {
            include: {
              question: { select: { text: true, category: true, questionType: true, optionsJson: true } },
            },
          },
        },
      },
      adHocQuizzes: {
        orderBy: { sentAt: "desc" },
        include: {
          sentBy: { select: { name: true } },
          answerSet: {
            include: {
              answers: {
                include: {
                  question: { select: { text: true, category: true, questionType: true, optionsJson: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!ae) {
    return (
      <div className="page max-w-3xl">
        <div className="card p-8 text-center">
          <p className="text-sm text-ink-muted">No AE profile yet — check with your director.</p>
        </div>
      </div>
    );
  }

  // Pull this user's pending retake requests
  const pendingRetakes = await prisma.quizRetakeRequest.findMany({
    where: { requesterUserId: ctx.userId, status: { in: ["PENDING", "APPROVED", "DENIED"] } },
    select: { id: true, status: true, adHocQuizId: true, answerSetId: true, createdAt: true, decidedAt: true, decidedBy: { select: { name: true } } },
  });

  return (
    <div className="page max-w-3xl">
      <header className="mb-5">
        <div className="eyebrow mb-2">Intake & Quizzes</div>
        <h1 className="h-page">Your responses</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Every intake and quiz you've completed. Click a row to expand and see your answers.
          Need to redo one? Use "Request retake" — your coach will approve it.
        </p>
        <div className="mt-3 flex gap-2 flex-wrap">
          <Link href="/ae/card" className="btn-ghost text-sm">← Back to my card</Link>
          <Link href="/ae/intake" className="btn-secondary text-sm">📋 Open intake</Link>
        </div>
      </header>

      <IntakeAndQuizzesView
        intakeSets={ae.answerSets}
        quizzes={ae.adHocQuizzes}
        pendingRetakes={pendingRetakes}
        canRequestRetake={true}
        canApproveRetakes={false}
      />
    </div>
  );
}
