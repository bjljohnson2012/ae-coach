/**
 * POST /api/retakes/[id]   — { decision: "APPROVED" | "DENIED", note? }
 *
 * If APPROVED + the request is for an AdHocQuiz, creates a fresh AdHocQuiz with
 * the same questionIds and emails the requester a new token link.
 * If APPROVED + the request is for an AnswerSet (intake), the requester just gets
 * a notification email — the next time they hit /ae/intake?retake=1 they can redo.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireSession, getManageableUsers } from "@/lib/tenancy";
import { sendEmail } from "@/lib/email";

const Body = z.object({
  decision: z.enum(["APPROVED", "DENIED"]),
  note: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireSession();
  if (ctx.role === "AE") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const request = await prisma.quizRetakeRequest.findUnique({
    where: { id: params.id },
    include: {
      requester: { select: { id: true, name: true, email: true, orgId: true } },
      adHocQuiz: true,
    },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (request.status !== "PENDING") return NextResponse.json({ error: `Already ${request.status.toLowerCase()}` }, { status: 410 });

  // Authorize — must be in caller's manageable set
  const manageable = await getManageableUsers(ctx);
  if (!manageable.some((u) => u.id === request.requesterUserId)) {
    return NextResponse.json({ error: "Forbidden — requester is outside your scope" }, { status: 403 });
  }

  if (parsed.data.decision === "DENIED") {
    const updated = await prisma.quizRetakeRequest.update({
      where: { id: request.id },
      data: {
        status: "DENIED",
        decidedByUserId: ctx.userId,
        decidedAt: new Date(),
        decisionNote: parsed.data.note ?? null,
      },
    });
    // Notify the requester
    const subject = `Retake request denied`;
    const html = `<p>Hi ${request.requester.name.split(" ")[0]},</p>
      <p>Your retake request was reviewed and not approved at this time.</p>
      ${parsed.data.note ? `<p><strong>Reason:</strong> ${parsed.data.note}</p>` : ""}
      <p>Reach out to your coach if you have questions.</p>`;
    await sendEmail(
      { to: request.requester.email, subject, html, text: subject + (parsed.data.note ? `\n\n${parsed.data.note}` : "") },
      { orgId: request.requester.orgId },
    );
    return NextResponse.json({ request: updated });
  }

  // APPROVED
  let approvedAdHocQuizId: string | null = null;

  if (request.adHocQuizId && request.adHocQuiz) {
    // Create a fresh AdHocQuiz with the same questions
    const tokenRaw = crypto.randomBytes(24).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(tokenRaw).digest("hex");
    const expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000);

    const newQuiz = await prisma.adHocQuiz.create({
      data: {
        aeProfileId: request.adHocQuiz.aeProfileId,
        directorProfileId: request.adHocQuiz.directorProfileId,
        sentByUserId: ctx.userId,
        title: `Retake: ${request.adHocQuiz.title}`,
        description: `Approved retake. ${parsed.data.note ?? ""}`.trim(),
        kind: request.adHocQuiz.kind,
        questionIds: request.adHocQuiz.questionIds as any,
        focusAreas: request.adHocQuiz.focusAreas as any,
        tokenHash,
        expiresAt,
      },
    });
    approvedAdHocQuizId = newQuiz.id;

    const appUrl = process.env.APP_URL ?? "https://portal.benjohnson.ai";
    const link = `${appUrl}/quiz/${tokenRaw}`;
    const subject = `Retake approved: ${request.adHocQuiz.title}`;
    const html = `<p>Hi ${request.requester.name.split(" ")[0]},</p>
      <p>Your retake was approved. Take it again here:</p>
      <p><a href="${link}" style="display:inline-block;background:#FF6A1A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Take the quiz →</a></p>
      <p>Link expires ${expiresAt.toLocaleDateString()}.</p>
      ${parsed.data.note ? `<p><strong>Note from your coach:</strong> ${parsed.data.note}</p>` : ""}`;
    const text = `Retake approved. ${link}\n\nExpires ${expiresAt.toLocaleDateString()}.`;
    await sendEmail(
      { to: request.requester.email, subject, html, text },
      { orgId: request.requester.orgId },
    );
  } else if (request.answerSetId) {
    // Intake retake — just notify; AE goes to /ae/intake?retake=1
    const appUrl = process.env.APP_URL ?? "https://portal.benjohnson.ai";
    const subject = `Intake retake approved`;
    const html = `<p>Hi ${request.requester.name.split(" ")[0]},</p>
      <p>You've been approved to retake your intake. Use this link:</p>
      <p><a href="${appUrl}/ae/intake?retake=1" style="display:inline-block;background:#FF6A1A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Retake intake →</a></p>
      ${parsed.data.note ? `<p><strong>Note from your coach:</strong> ${parsed.data.note}</p>` : ""}`;
    const text = `Intake retake approved. ${appUrl}/ae/intake?retake=1`;
    await sendEmail(
      { to: request.requester.email, subject, html, text },
      { orgId: request.requester.orgId },
    );
  }

  const updated = await prisma.quizRetakeRequest.update({
    where: { id: request.id },
    data: {
      status: "APPROVED",
      decidedByUserId: ctx.userId,
      decidedAt: new Date(),
      decisionNote: parsed.data.note ?? null,
      approvedAdHocQuizId,
    },
  });

  return NextResponse.json({ request: updated, approvedAdHocQuizId });
}
