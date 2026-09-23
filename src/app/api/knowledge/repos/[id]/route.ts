import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Patch = z.object({
  name: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  visibility: z.enum(["AE_ONLY", "DIRECTOR_ONLY", "BOTH"]).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("COMPANY_ADMIN", "ORG_ADMIN");
  const repo = await prisma.knowledgeRepository.findUnique({ where: { id: params.id } });
  if (!repo || repo.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const updated = await prisma.knowledgeRepository.update({
    where: { id: params.id },
    data: parsed.data as any,
  });
  return NextResponse.json({ repo: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN");
  const repo = await prisma.knowledgeRepository.findUnique({ where: { id: params.id } });
  if (!repo) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.knowledgeRepository.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
