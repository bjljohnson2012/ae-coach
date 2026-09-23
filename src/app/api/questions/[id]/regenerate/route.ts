import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { generateQuestions } from "@/lib/ai";

/**
 * POST /api/questions/[id]/regenerate
 * Generates a single replacement question of the same type/category, returns it as a draft.
 * Does NOT persist — admin reviews then saves via PATCH.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN", "VP_SALES");
  const q = await prisma.question.findUnique({ where: { id: params.id } });
  if (!q || (q.orgId && q.orgId !== ctx.effectiveOrgId && ctx.role !== "ORG_ADMIN")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Avoid existing texts in same category
  const existing = await prisma.question.findMany({
    where: { category: q.category, OR: [{ orgId: ctx.effectiveOrgId }, { orgId: null }] },
    select: { text: true },
    take: 50,
  });

  const drafts = await generateQuestions({
    category: q.category,
    count: 1,
    avoidTexts: existing.map((e) => e.text),
    allowedTypes: [q.questionType] as any,
  });
  return NextResponse.json({ draft: drafts[0] ?? null });
}
