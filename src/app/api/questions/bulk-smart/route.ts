/**
 * POST /api/questions/bulk-smart
 * Body: { category, count, coverageTargets?, styleHint?, allowedTypes? }
 * Returns: { analysis, draft }
 *
 * Workflow:
 *   1. Loads all current questions in the bank for this category (up to 100)
 *   2. Asks Grok to analyze coverage by tag
 *   3. Generates `count` new questions targeting gaps and coverageTargets
 *
 * Director then reviews + saves the drafts via /api/questions.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { generateSmartBulkQuestions } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 90;

const Body = z.object({
  category: z.string(),
  count: z.number().int().min(5).max(100).default(20),
  coverageTargets: z.array(z.string()).max(40).optional(),
  styleHint: z.string().max(400).optional(),
  allowedTypes: z.array(z.enum(["LONG_FORM", "MULTIPLE_CHOICE", "LIKERT", "SLIDER"])).optional(),
});

export async function POST(req: Request) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const cp = await prisma.companyProfile.findUnique({ where: { orgId: ctx.effectiveOrgId } });
  const org = await prisma.org.findUnique({ where: { id: ctx.effectiveOrgId }, select: { aiModel: true } });

  // Pull existing questions for the same category — both global and org-scoped
  const existing = await prisma.question.findMany({
    where: {
      OR: [{ orgId: ctx.effectiveOrgId }, { orgId: null }],
      category: parsed.data.category as any,
      active: true,
    },
    select: { text: true, tagsJson: true, optionsJson: true },
    take: 100,
  });

  const existingForAi = existing.map((q) => {
    const optionTags: string[] = [];
    if (Array.isArray(q.optionsJson)) {
      for (const o of q.optionsJson as any[]) {
        if (Array.isArray(o?.tags)) optionTags.push(...(o.tags as string[]));
      }
    }
    const qTags = Array.isArray(q.tagsJson) ? (q.tagsJson as string[]) : [];
    return { text: q.text, tags: [...qTags, ...optionTags] };
  });

  const result = await generateSmartBulkQuestions(
    {
      category: parsed.data.category,
      existingQuestions: existingForAi,
      count: parsed.data.count,
      coverageTargets: parsed.data.coverageTargets,
      styleHint: parsed.data.styleHint,
      allowedTypes: parsed.data.allowedTypes,
      context: {
        salesMethodology: cp?.salesMethodology ?? undefined,
        companyValues: ((cp?.values as any) ?? []) as string[],
      },
    },
    org?.aiModel,
  );

  return NextResponse.json(result);
}
