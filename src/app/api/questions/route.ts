/**
 * GET  /api/questions?category=...&productId=... — list
 * POST /api/questions                          — create one (manual)
 *
 * Duplicate handling on POST:
 *   - On create, we run the same normalize + match check the UI uses.
 *   - If a duplicate exists in global or the target org's bank, return 409
 *     with the matched question. The client can show "Use existing instead?"
 *     or call POST again with `force: true` to override.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { findDuplicateQuestion } from "@/lib/questionDedup";

export async function GET(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") || undefined;
  const productId = searchParams.get("productId") || undefined;

  const questions = await prisma.question.findMany({
    where: {
      OR: [{ orgId: ctx.effectiveOrgId }, { orgId: null }],
      ...(category ? { category: category as any } : {}),
      ...(productId ? { productId } : {}),
    },
    orderBy: [{ category: "asc" }, { orderHint: "asc" }],
    include: { product: { select: { id: true, name: true } } },
  });
  return NextResponse.json({ questions });
}

const CreateBody = z.object({
  category: z.string(),
  questionType: z.enum(["LONG_FORM", "MULTIPLE_CHOICE", "LIKERT", "SLIDER"]),
  text: z.string().min(5),
  optionsJson: z.any().optional(),
  tagsJson: z.array(z.string()).default([]),
  productId: z.string().optional(),
  // ORG_ADMIN authoring on behalf of a specific customer org. Other roles
  // ignore this and write to their own effectiveOrgId.
  targetOrgId: z.string().optional(),
  weight: z.number().default(1.0),
  orderHint: z.number().int().default(0),
  aiGenerated: z.boolean().default(false),
  originalText: z.string().optional(),
  // Override the duplicate check. UI sets this to true after the user
  // explicitly says "Save anyway" in the duplicate-warning modal.
  force: z.boolean().default(false),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const parsed = CreateBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });

  // Resolve the target org. Only ORG_ADMIN can target a non-self org.
  const writeOrgId = ctx.role === "ORG_ADMIN" && parsed.data.targetOrgId
    ? parsed.data.targetOrgId
    : ctx.effectiveOrgId;

  // Duplicate check (skipped if force=true)
  if (!parsed.data.force) {
    const match = await findDuplicateQuestion({
      text: parsed.data.text,
      category: parsed.data.category,
      targetOrgId: writeOrgId,
    });
    if (match) {
      return NextResponse.json(
        { error: "Duplicate question exists", duplicate: match },
        { status: 409 }
      );
    }
  }

  const q = await prisma.question.create({
    data: {
      orgId: writeOrgId,
      category: parsed.data.category as any,
      questionType: parsed.data.questionType as any,
      text: parsed.data.text,
      optionsJson: parsed.data.optionsJson ?? undefined,
      tagsJson: parsed.data.tagsJson as any,
      productId: parsed.data.productId,
      weight: parsed.data.weight,
      orderHint: parsed.data.orderHint,
      aiGenerated: parsed.data.aiGenerated,
      originalText: parsed.data.originalText,
      authorUserId: ctx.userId,
      active: true,
    },
  });

  await prisma.auditLog.create({
    data: {
      orgId: writeOrgId,
      actorUserId: ctx.userId,
      action: parsed.data.aiGenerated ? "QUESTION_AI_GENERATED" : "QUESTION_CREATED",
      targetType: "Question",
      targetId: q.id,
      metadata: parsed.data.force ? { duplicateOverride: true } : undefined,
    },
  });

  return NextResponse.json({ question: q });
}
