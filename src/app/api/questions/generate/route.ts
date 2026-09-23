/**
 * POST /api/questions/generate
 * Body: { category, count, productId? }
 * Returns AI-generated draft questions WITHOUT persisting them.
 * Director reviews, edits, and POSTs them to /api/questions to save.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { generateQuestions } from "@/lib/ai";

const Body = z.object({
  category: z.string(),
  count: z.number().int().min(1).max(20).default(5),
  productId: z.string().optional(),
  types: z.array(z.enum(["LONG_FORM", "MULTIPLE_CHOICE", "LIKERT", "SLIDER"])).optional(),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const cp = await prisma.companyProfile.findUnique({ where: { orgId: ctx.effectiveOrgId } });
  let productCtx: any = undefined;
  if (parsed.data.productId) {
    const p = await prisma.product.findUnique({ where: { id: parsed.data.productId } });
    if (p) productCtx = { productName: p.name, productSummary: p.summary ?? undefined };
  }

  const existing = await prisma.question.findMany({
    where: {
      OR: [{ orgId: ctx.effectiveOrgId }, { orgId: null }],
      category: parsed.data.category as any,
    },
    select: { text: true },
    take: 50,
  });

  const draft = await generateQuestions({
    category: parsed.data.category,
    count: parsed.data.count,
    context: {
      ...productCtx,
      salesMethodology: cp?.salesMethodology ?? undefined,
      companyValues: ((cp?.values as any) ?? []) as string[],
    },
    avoidTexts: existing.map((e) => e.text),
    allowedTypes: parsed.data.types,
  } as any);

  return NextResponse.json({ draft });
}
