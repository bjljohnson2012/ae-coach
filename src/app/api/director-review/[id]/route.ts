import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const review = await prisma.directorReview.findUnique({ where: { id: params.id } });
  if (!review) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ctx.role === "DIRECTOR" && review.directorId !== ctx.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await prisma.directorReview.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
