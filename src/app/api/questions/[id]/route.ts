import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Patch = z.object({
  text: z.string().min(5).optional(),
  optionsJson: z.any().optional(),
  tagsJson: z.array(z.string()).optional(),
  weight: z.number().optional(),
  orderHint: z.number().int().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const q = await prisma.question.findUnique({ where: { id: params.id } });
  if (!q || (q.orgId && q.orgId !== ctx.effectiveOrgId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Preserve originalText on first edit if AI-generated
  const data: any = { ...parsed.data };
  if (parsed.data.text && q.aiGenerated && !q.originalText) {
    data.originalText = q.text;
  }

  const updated = await prisma.question.update({ where: { id: params.id }, data });
  return NextResponse.json({ question: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "ORG_ADMIN");
  const q = await prisma.question.findUnique({ where: { id: params.id } });
  if (!q || (q.orgId && q.orgId !== ctx.effectiveOrgId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Soft delete via active flag — Question has FK from Answer
  await prisma.question.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
