/**
 * POST /api/ae/[id]/generate-tasks
 * Body: { count?: number }
 * Returns AI-drafted tasks (NOT persisted). Director reviews + saves.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireRole, assertCanAccessAe } from "@/lib/tenancy";
import { generateTasksForAe } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ count: z.number().int().min(1).max(15).default(5) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireRole("DIRECTOR", "VP_SALES", "COMPANY_ADMIN", "ORG_ADMIN");
  const access = await assertCanAccessAe(ctx, params.id);
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const ae = await prisma.aeProfile.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { name: true } },
      skillScores: true,
      tasks: { where: { status: { in: ["OPEN", "IN_PROGRESS"] } }, select: { title: true } },
    },
  });
  if (!ae) return NextResponse.json({ error: "AE not found" }, { status: 404 });

  const draft = await generateTasksForAe({
    aeName: ae.user.name,
    strengths: (ae.strengthsJson as string[]) ?? [],
    weaknesses: (ae.weaknessesJson as string[]) ?? [],
    skillScores: ae.skillScores.map((s) => ({ category: s.category, score: s.score })),
    existingOpenTasks: ae.tasks.map((t) => ({ title: t.title })),
    count: parsed.data.count,
  });

  return NextResponse.json({ draft });
}
