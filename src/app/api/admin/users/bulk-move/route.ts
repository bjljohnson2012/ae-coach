/**
 * POST /api/admin/users/bulk-move
 *
 * Bulk-reassign multiple AEs to a single director (or null to unassign).
 *
 * Body:
 *   {
 *     userIds: string[]      // User IDs of the AEs to move
 *     directorId: string | null  // Target director's User ID, or null to unassign
 *   }
 *
 * Authorization:
 *   - ORG_ADMIN: can move any AEs to any director (cross-org allowed; we pick
 *     the AE's org as the boundary check for the target director)
 *   - COMPANY_ADMIN: can only move AEs in their own org to a director in
 *     their own org
 *   - All other roles: forbidden
 *
 * Each AE must be in the same org as the target director (or both nullable
 * if directorId is null). Mismatched moves are skipped with a per-user error
 * in the response so the caller can show partial success.
 *
 * Every successful move writes a USER_MOVED_ORG audit log entry (we reuse
 * that action since the action is "user reassignment" — director change is
 * a structural move within the org).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/tenancy";

const Body = z.object({
  userIds: z.array(z.string()).min(1).max(100),
  directorId: z.string().nullable(),
});

interface MoveResult {
  userId: string;
  ok: boolean;
  error?: string;
}

export async function POST(req: Request) {
  const ctx = await requireRole("ORG_ADMIN", "COMPANY_ADMIN");

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { userIds, directorId } = parsed.data;

  // Resolve the target director (if any) and validate role + org.
  let targetDirector: { id: string; role: string; orgId: string } | null = null;
  if (directorId) {
    const d = await prisma.user.findUnique({
      where: { id: directorId },
      select: { id: true, role: true, orgId: true, name: true },
    });
    if (!d) {
      return NextResponse.json({ error: "Target director not found" }, { status: 404 });
    }
    if (d.role !== "DIRECTOR") {
      return NextResponse.json({ error: "Target user is not a Director" }, { status: 400 });
    }
    if (ctx.role === "COMPANY_ADMIN" && d.orgId !== ctx.effectiveOrgId) {
      return NextResponse.json({ error: "Target director is in a different org" }, { status: 403 });
    }
    targetDirector = d;
  }

  const results: MoveResult[] = [];

  // Process each AE individually so a single bad row doesn't fail the batch.
  for (const userId of userIds) {
    try {
      const aeUser = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true, role: true, orgId: true, name: true,
          aeProfile: { select: { id: true, directorId: true } },
        },
      });
      if (!aeUser) {
        results.push({ userId, ok: false, error: "User not found" });
        continue;
      }
      if (aeUser.role !== "AE") {
        results.push({ userId, ok: false, error: `Not an AE (${aeUser.role})` });
        continue;
      }
      if (!aeUser.aeProfile) {
        results.push({ userId, ok: false, error: "AE has no profile yet" });
        continue;
      }

      // Tenant boundary: COMPANY_ADMIN can only move within their org.
      if (ctx.role === "COMPANY_ADMIN" && aeUser.orgId !== ctx.effectiveOrgId) {
        results.push({ userId, ok: false, error: "AE is in a different org" });
        continue;
      }

      // Director-AE org match: AE and director must be in the same org.
      if (targetDirector && targetDirector.orgId !== aeUser.orgId) {
        results.push({ userId, ok: false, error: "Director and AE are in different orgs" });
        continue;
      }

      const previousDirectorId = aeUser.aeProfile.directorId;
      if (previousDirectorId === directorId) {
        results.push({ userId, ok: true }); // already there — treat as success no-op
        continue;
      }

      await prisma.aeProfile.update({
        where: { id: aeUser.aeProfile.id },
        data: { directorId: directorId },
      });

      await prisma.auditLog.create({
        data: {
          orgId: aeUser.orgId,
          actorUserId: ctx.userId,
          action: "USER_MOVED_ORG",
          targetType: "User",
          targetId: aeUser.id,
          metadata: {
            bulkMove: true,
            previousDirectorId: previousDirectorId,
            newDirectorId: directorId,
          },
        },
      }).catch(() => null);

      results.push({ userId, ok: true });
    } catch (err: any) {
      results.push({ userId, ok: false, error: err?.message ?? "unknown error" });
    }
  }

  const successCount = results.filter((r) => r.ok).length;
  const failureCount = results.length - successCount;

  return NextResponse.json({
    ok: failureCount === 0,
    successCount,
    failureCount,
    results,
    targetDirectorName: targetDirector ? (await prisma.user.findUnique({ where: { id: targetDirector.id }, select: { name: true } }))?.name ?? null : null,
  });
}
