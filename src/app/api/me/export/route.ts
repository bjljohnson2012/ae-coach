/**
 * GET /api/me/export
 *
 * Self-service data export. Any authenticated user can download a JSON file
 * containing every record where they are the subject:
 *   - User record (no password hash)
 *   - AE profile + skill scores + skill score history + answer sets + answers
 *   - Director profile + skill scores + answer sets + answers
 *   - Director reviews where they are the AE (with the director's answers)
 *   - Coaching notes about them
 *   - Prep docs about them
 *   - Ad-hoc quizzes sent to them
 *   - Tasks assigned to them
 *   - 1:1 prep documents about them
 *
 * Privacy logic: a user owns their intake responses, their skill scores, and
 * the coaching artifacts that describe them. We exclude things like other
 * users' data, audit logs the user can't see, and SMTP credentials.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";

export async function GET() {
  const ctx = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: ctx.userId },
    select: {
      id: true, email: true, name: true, role: true, status: true, imageUrl: true,
      orgId: true, vpId: true, invitedById: true, invitedAt: true,
      passwordSetAt: true, lastLoginAt: true, createdAt: true, updatedAt: true,
      org: { select: { id: true, name: true, slug: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const [
    aeProfile,
    directorProfile,
    tasksAssigned,
    coachingNotes,
    prepDocs,
    oneOnOnePreps,
    adHocQuizzes,
    directorReviews,
  ] = await Promise.all([
    prisma.aeProfile.findUnique({
      where: { userId: ctx.userId },
      include: {
        skillScores: true,
        skillScoreHistory: true,
        answerSets: { include: { answers: true } },
      },
    }),
    prisma.directorProfile.findUnique({
      where: { userId: ctx.userId },
      include: {
        skillScores: true,
        answerSets: { include: { answers: true } },
      },
    }),
    prisma.task.findMany({
      where: { assigneeUserId: ctx.userId },
    }),
    // Coaching notes targeting them — only present if they are an AE.
    prisma.coachingNote.findMany({
      where: { aeProfile: { userId: ctx.userId } },
    }).catch(() => []),
    prisma.prepDoc.findMany({
      where: { aeProfile: { userId: ctx.userId } },
    }).catch(() => []),
    prisma.oneOnOnePrep.findMany({
      where: {
        OR: [
          { aeProfile: { userId: ctx.userId } },
          { directorProfile: { userId: ctx.userId } },
        ],
      },
    }).catch(() => []),
    prisma.adHocQuiz.findMany({
      where: {
        OR: [
          { aeProfile: { userId: ctx.userId } },
          { directorProfile: { userId: ctx.userId } },
        ],
      },
      include: { answerSet: { include: { answers: true } } },
    }).catch(() => []),
    prisma.directorReview.findMany({
      where: { aeProfile: { userId: ctx.userId } },
      include: { answers: true },
    }).catch(() => []),
  ]);

  const exportPayload = {
    schemaVersion: "1.0",
    exportedAt: new Date().toISOString(),
    exportType: "self-service-user-export",
    user,
    counts: {
      tasksAssigned: tasksAssigned.length,
      coachingNotes: coachingNotes.length,
      prepDocs: prepDocs.length,
      oneOnOnePreps: oneOnOnePreps.length,
      adHocQuizzes: adHocQuizzes.length,
      directorReviews: directorReviews.length,
      hasAeProfile: !!aeProfile,
      hasDirectorProfile: !!directorProfile,
    },
    aeProfile,
    directorProfile,
    tasksAssigned,
    coachingNotes,
    prepDocs,
    oneOnOnePreps,
    adHocQuizzes,
    directorReviews,
  };

  // Audit-log the self-export so the org admin can see who's pulling their data.
  await prisma.auditLog.create({
    data: {
      orgId: user.orgId,
      actorUserId: ctx.userId,
      action: "ORG_DATA_EXPORTED",
      targetType: "User",
      targetId: user.id,
      metadata: { selfExport: true, counts: exportPayload.counts },
    },
  }).catch(() => null); // best-effort — don't fail the export if audit fails

  const safeName = (user.name || user.email).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const filename = `${safeName}-data-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
