import { prisma } from "@/lib/prisma";
import { IntakeAndQuizzesView } from "../../../ae/quizzes/IntakeAndQuizzesView";

/**
 * Server-rendered tab on /director/ae/[id]. Shows all intake submissions + quizzes
 * for the AE, in compressed form. Leaders can approve retake requests.
 */
export async function IntakeQuizzesTab({ aeProfileId, viewerRole }: { aeProfileId: string; viewerRole: string }) {
  const ae = await prisma.aeProfile.findUnique({
    where: { id: aeProfileId },
    include: {
      user: { select: { id: true } },
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

  if (!ae) return <div className="text-sm text-ink-muted">AE not found.</div>;

  const pendingRetakes = await prisma.quizRetakeRequest.findMany({
    where: { requesterUserId: ae.user.id },
    select: {
      id: true, status: true, adHocQuizId: true, answerSetId: true,
      createdAt: true, decidedAt: true,
      decidedBy: { select: { name: true } },
    },
  });

  const isLeader = ["ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES", "DIRECTOR"].includes(viewerRole);

  return (
    <IntakeAndQuizzesView
      intakeSets={ae.answerSets}
      quizzes={ae.adHocQuizzes}
      pendingRetakes={pendingRetakes}
      canRequestRetake={false}
      canApproveRetakes={isLeader}
    />
  );
}
