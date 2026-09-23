/**
 * POST /api/knowledge/articles/[id]/cleanup
 * Body: { instructions: string }
 * Returns the AI-revised draft (does NOT save). Caller saves via PATCH.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";
import { cleanupArticleWithInstructions } from "@/lib/ai";

const Body = z.object({
  instructions: z.string().min(2).max(2000),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const article = await prisma.knowledgeArticle.findUnique({
    where: { id: params.id },
    include: { repository: { select: { name: true } } },
  });
  if (!article || article.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const revised = await cleanupArticleWithInstructions({
      title: article.title,
      body: article.body,
      tags: ((article.tagsJson as string[]) ?? []),
      instructions: parsed.data.instructions,
      repositoryName: article.repository.name,
    });
    return NextResponse.json({ revised });
  } catch (e: any) {
    return NextResponse.json({ error: `AI cleanup failed: ${e?.message ?? "unknown"}` }, { status: 502 });
  }
}
