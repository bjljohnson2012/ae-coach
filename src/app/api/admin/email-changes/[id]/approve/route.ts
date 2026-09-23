import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  const ecr = await prisma.emailChangeRequest.findUnique({ where: { id: params.id } });
  if (!ecr) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (ecr.status !== "PENDING") return NextResponse.json({ error: "Already decided" }, { status: 400 });

  const target = await prisma.user.findUnique({ where: { id: ecr.userId } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  if (ctx.role === "COMPANY_ADMIN" && target.orgId !== ctx.effectiveOrgId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Race: re-check email isn't taken
  const taken = await prisma.user.findUnique({ where: { email: ecr.requestedEmail } });
  if (taken && taken.id !== target.id) {
    await prisma.emailChangeRequest.update({
      where: { id: ecr.id },
      data: {
        status: "REJECTED",
        decidedByUserId: ctx.userId,
        decidedAt: new Date(),
        rejectionReason: "Email is already in use by another account.",
      },
    });
    return NextResponse.json({ error: "Email already taken — request auto-rejected." }, { status: 409 });
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { email: ecr.requestedEmail } }),
    prisma.emailChangeRequest.update({
      where: { id: ecr.id },
      data: { status: "APPROVED", decidedByUserId: ctx.userId, decidedAt: new Date() },
    }),
    prisma.auditLog.create({
      data: {
        orgId: target.orgId,
        actorUserId: ctx.userId,
        action: "USER_EMAIL_CHANGED",
        targetType: "User",
        targetId: target.id,
        metadata: { from: ecr.currentEmail, to: ecr.requestedEmail },
      },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
