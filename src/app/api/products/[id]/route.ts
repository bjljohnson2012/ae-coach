import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Patch = z.object({
  name: z.string().min(1).optional(),
  summary: z.string().nullable().optional(),
  audience: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product || product.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  const updated = await prisma.product.update({ where: { id: params.id }, data: parsed.data as any });
  return NextResponse.json({ product: updated });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("COMPANY_ADMIN", "ORG_ADMIN");
  const product = await prisma.product.findUnique({ where: { id: params.id } });
  if (!product || product.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Soft delete (Question.productId is SetNull on delete; keep history clean)
  await prisma.product.update({ where: { id: params.id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
