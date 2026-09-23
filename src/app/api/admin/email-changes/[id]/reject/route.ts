import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Body = z.object({ reason: z.string().max(500).optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  const ecr = await prisma.emailChangeRequest.findUnique({ where: { id: params.id } });
  if (!ecr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ecr.status !== "PENDING") return NextResponse.json({ error: "Already decided" }, { status: 400 });
  const target = await prisma.user.findUnique({ where: { id: ecr.userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (ctx.role === "COMPANY_ADMIN" && target.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  await prisma.emailChangeRequest.update({
    where: { id: ecr.id },
    data: {
      status: "REJECTED",
      decidedByUserId: ctx.userId,
      decidedAt: new Date(),
      rejectionReason: parsed.success ? parsed.data.reason : null,
    },
  });
  return NextResponse.json({ ok: true });
}
