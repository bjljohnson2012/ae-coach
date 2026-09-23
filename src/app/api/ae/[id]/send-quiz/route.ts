/**
 * POST /api/ae/[id]/send-quiz
 *
 * Body (one of):
 *   { mode: "preview", count: 8, focusAreas: ["DISCOVERY"], styleHint?: string }
 *      → returns AI-suggested question IDs WITHOUT persisting
 *   { mode: "send", title, description?, kind, questionIds[], expiresInDays?, focusAreas? }
 *      → creates AdHocQuiz, generates token, emails the AE the link
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";
import { selectQuizQuestions } from "@/lib/ai";
import { sendEmail } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 60;

const PreviewBody = z.object({
  mode: z.literal("preview"),
  count: z.number().int().min(3).max(25).default(8),
  focusAreas: z.array(z.string()).max(20).optional(),
  styleHint: z.string().max(400).optional(),
});

const SendBody = z.object({
  mode: z.literal("send"),
  title: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  kind: z.enum(["SKILL_CHECK_IN", "RECURRING", "CUSTOM"]).default("SKILL_CHECK_IN"),
  questionIds: z.array(z.string()).min(1).max(50),
  focusAreas: z.array(z.string()).max(20).optional(),
  expiresInDays: z.number().int().min(1).max(60).default(14),
});

const Body = z.union([PreviewBody, SendBody]);

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

  const ae = await prisma.aeProfile.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { name: true, email: true } },
      skillScores: true,
      org: { select: { aiModel: true, name: true } },
    },
  });
  if (!ae) return NextResponse.json({ error: "AE not found" }, { status: 404 });

  if (parsed.data.mode === "preview") {
    // Pull candidate questions for the focus areas (or general if not specified)
    const focusAreas = parsed.data.focusAreas ?? [];
    const candidates = await prisma.question.findMany({
      where: {
        OR: [{ orgId: ae.orgId }, { orgId: null }],
        active: true,
      },
      select: { id: true, text: true, tagsJson: true, questionType: true, category: true, optionsJson: true },
      take: 200,
    });
    const candidateForAi = candidates.map((c: any) => {
      const optionTags: string[] = [];
      if (Array.isArray(c.optionsJson)) {
        for (const o of c.optionsJson as any[]) {
          if (Array.isArray(o?.tags)) optionTags.push(...o.tags);
        }
      }
      const allTags = [...((c.tagsJson as string[]) ?? []), ...optionTags];
      return {
        id: c.id,
        text: c.text.slice(0, 200),
        tags: allTags.slice(0, 10),
        questionType: c.questionType,
        category: c.category,
      };
    });

    // Filter candidates that touch any focus area, if specified
    const filtered = focusAreas.length > 0
      ? candidateForAi.filter((q) =>
          q.tags.some((t) => focusAreas.some((f) => t.toUpperCase().startsWith(f.toUpperCase())))
        )
      : candidateForAi;

    const pool = filtered.length > 5 ? filtered : candidateForAi;

    const result = await selectQuizQuestions({
      aeName: ae.user.name,
      weaknesses: (ae.weaknessesJson as string[]) ?? [],
      skillScores: ae.skillScores.map((s) => ({ category: s.category, score: s.score })),
      focusAreas,
      candidateQuestions: pool.slice(0, 80),
      count: parsed.data.count,
    }, ae.org?.aiModel);

    // Resolve full question objects in the order Grok returned
    const orderedQuestions = result.questionIds
      .map((id) => candidates.find((c) => c.id === id))
      .filter(Boolean);

    return NextResponse.json({
      questions: orderedQuestions,
      rationale: result.rationale,
    });
  }

  // SEND mode
  const data = parsed.data;
  const tokenRaw = crypto.randomBytes(24).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(tokenRaw).digest("hex");
  const expiresAt = new Date(Date.now() + data.expiresInDays * 24 * 3600 * 1000);

  const quiz = await prisma.adHocQuiz.create({
    data: {
      aeProfileId: ae.id,
      sentByUserId: ctx.userId,
      title: data.title,
      description: data.description ?? null,
      kind: data.kind as any,
      questionIds: data.questionIds as any,
      focusAreas: (data.focusAreas ?? []) as any,
      tokenHash,
      expiresAt,
    },
  });

  // Send email
  const appUrl = process.env.APP_URL ?? "https://portal.benjohnson.ai";
  const link = `${appUrl}/quiz/${tokenRaw}`;
  const subject = `${ae.org?.name ?? "Sales Coach"}: ${data.title}`;
  const html = `
    <p>Hi ${ae.user.name.split(" ")[0]},</p>
    <p>Your coach has sent you a quick check-in quiz.</p>
    ${data.description ? `<p><em>${data.description}</em></p>` : ""}
    <p><strong>${data.questionIds.length} questions · about ${Math.max(2, Math.round(data.questionIds.length * 0.3))} minutes</strong></p>
    <p><a href="${link}" style="display:inline-block;background:#FF6A1A;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">Take the quiz →</a></p>
    <p>Or paste this link into your browser:<br /><code>${link}</code></p>
    <p>This link expires on ${expiresAt.toLocaleDateString()}.</p>
  `.trim();
  const text = `Hi ${ae.user.name.split(" ")[0]},\n\nYour coach has sent you a quick check-in quiz.\n${data.description ?? ""}\n\nTake the quiz: ${link}\n\nThis link expires on ${expiresAt.toLocaleDateString()}.`;

  const emailResult = await sendEmail(
    { to: ae.user.email, subject, html, text },
    { orgId: ae.orgId },
  );

  return NextResponse.json({
    quizId: quiz.id,
    tokenLink: link,
    expiresAt,
    email: emailResult,
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const quizzes = await prisma.adHocQuiz.findMany({
    where: { aeProfileId: params.id },
    orderBy: { sentAt: "desc" },
    take: 30,
    select: {
      id: true,
      title: true,
      kind: true,
      status: true,
      sentAt: true,
      completedAt: true,
      expiresAt: true,
      questionIds: true,
      focusAreas: true,
      sentBy: { select: { name: true } },
    },
  });
  return NextResponse.json({ quizzes });
}
