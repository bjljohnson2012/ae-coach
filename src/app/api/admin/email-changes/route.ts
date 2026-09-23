import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

export async function GET() {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");
  // Find users in scope
  const userScope = ctx.role === "ORG_ADMIN"
    ? {}
    : { orgId: ctx.effectiveOrgId };
  const users = await prisma.user.findMany({ where: userScope, select: { id: true } });
  const userIds = users.map((u) => u.id);

  const requests = await prisma.emailChangeRequest.findMany({
    where: { userId: { in: userIds } },
    orderBy: [{ status: "asc" }, { requestedAt: "desc" }],
    take: 200,
  });

  // Hydrate user info
  const targetIds = Array.from(new Set(requests.map((r) => r.userId)));
  const targets = await prisma.user.findMany({
    where: { id: { in: targetIds } },
    select: { id: true, name: true, role: true, org: { select: { name: true } } },
  });
  const byId = new Map(targets.map((t) => [t.id, t]));

  return NextResponse.json({
    requests: requests.map((r) => ({ ...r, user: byId.get(r.userId) ?? null })),
  });
}
