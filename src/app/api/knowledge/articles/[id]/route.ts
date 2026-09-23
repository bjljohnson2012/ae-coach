import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Patch = z.object({
  title: z.string().min(2).max(200).optional(),
  body: z.string().min(10).optional(),
  tagsJson: z.array(z.string()).optional(),
  productId: z.string().nullable().optional(),
  skillCategory: z.string().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const article = await prisma.knowledgeArticle.findUnique({ where: { id: params.id } });
  if (!article || article.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const updated = await prisma.knowledgeArticle.update({
    where: { id: params.id },
    data: parsed.data as any,
  });
  return NextResponse.json({ article: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("COMPANY_ADMIN", "ORG_ADMIN");
  const article = await prisma.knowledgeArticle.findUnique({ where: { id: params.id } });
  if (!article || article.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await prisma.knowledgeArticle.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
