/**
 * GET /api/me/task-count → returns the count of OPEN tasks assigned to the
 * current user. Drives the green badge on the Tasks nav button.
 *
 * Tiny endpoint; designed to be polled cheaply (every 30-60s) without DB strain.
 * Only counts OPEN status — DONE / CANCELLED don't drive the badge.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/lib/tenancy";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireSession();
  const count = await prisma.task.count({
    where: { assigneeUserId: ctx.userId, status: "OPEN" as any },
  });
  return NextResponse.json({ count });
}
