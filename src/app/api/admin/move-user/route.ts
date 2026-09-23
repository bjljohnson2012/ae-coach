/**
 * POST /api/admin/move-user — ORG_ADMIN only.
 * Moves a User (and their AeProfile or DirectorProfile) into a new Org.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Body = z.object({
  userId: z.string(),
  newOrgId: z.string(),
});

export async function POST(req: Request) {
  const ctx = await requireRole("ORG_ADMIN");
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const { userId, newOrgId } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const newOrg = await prisma.org.findUnique({ where: { id: newOrgId } });
  if (!newOrg) return NextResponse.json({ error: "Target org not found" }, { status: 404 });

  if (user.role === "ORG_ADMIN") {
    return NextResponse.json({ error: "Org admins are not movable" }, { status: 400 });
  }

  const oldOrgId = user.orgId;

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { orgId: newOrgId } }),
    ...(user.role === "AE"
      ? [prisma.aeProfile.updateMany({ where: { userId }, data: { orgId: newOrgId, directorId: null } })]
      : []),
    ...(user.role === "DIRECTOR"
      ? [prisma.directorProfile.updateMany({ where: { userId }, data: { orgId: newOrgId } })]
      : []),
    prisma.auditLog.create({
      data: {
        orgId: oldOrgId,
        actorUserId: ctx.userId,
        action: "USER_MOVED_ORG",
        targetType: "User",
        targetId: userId,
        metadata: { fromOrgId: oldOrgId, toOrgId: newOrgId, role: user.role },
      },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
