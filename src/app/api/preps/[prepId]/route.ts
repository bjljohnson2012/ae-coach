/**
 * GET /api/preps/[prepId]
 *
 * Single-prep status endpoint used by the client to poll while the AI is
 * working in the background. Returns:
 *   { id, status, generatedJson, errorMessage, startedAt, completedAt }
 *
 * Permission: any leader who can access either the AE or director referenced
 * by the prep. ORG_ADMIN can read any prep.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe, assertCanAccessDirector } from "@/lib/tenancy";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: { prepId: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");

  const prep = await prisma.oneOnOnePrep.findUnique({
    where: { id: params.prepId },
    select: {
      id: true,
      aeProfileId: true,
      directorProfileId: true,
      generatedJson: true,
      status: true,
      errorMessage: true,
      startedAt: true,
      completedAt: true,
      modelUsed: true,
      createdAt: true,
      preparedBy: { select: { name: true } },
    },
  });
  if (!prep) return NextResponse.json({ error: "Prep not found" }, { status: 404 });

  // Re-verify access via the right helper based on which target the prep tracks.
  if (prep.aeProfileId) {
    const ok = await assertCanAccessAe(ctx, prep.aeProfileId);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  } else if (prep.directorProfileId) {
    const ok = await assertCanAccessDirector(ctx, prep.directorProfileId);
    if (!ok) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ prep });
}
