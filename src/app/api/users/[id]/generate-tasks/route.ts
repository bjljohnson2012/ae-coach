/**
 * POST /api/users/[id]/generate-tasks
 * Body: { count?: number, personalNotes?: string }
 *
 * Generates AI task drafts for ANY user (AE, director, VP, admin, or self).
 * Auth: caller must be able to manage the target user (getManageableUsers).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession, getManageableUsers } from "@/lib/tenancy";
import { generateTasksForAe } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  count: z.number().int().min(1).max(15).default(5),
  personalNotes: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await requireSession();
  const manageable = await getManageableUsers(ctx);
  const target = manageable.find((u) => u.id === params.id);
  if (!target) return NextResponse.json({ error: "Forbidden — user is outside your scope" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  // Pull whichever profile they have + existing open tasks
  const [aeProfile, directorProfile, openAssignedTasks, openAeTasks] = await Promise.all([
    prisma.aeProfile.findUnique({
      where: { userId: target.id },
      include: { skillScores: true },
    }),
    prisma.directorProfile.findUnique({
      where: { userId: target.id },
      include: { skillScores: true },
    }),
    prisma.task.findMany({
      where: { assigneeUserId: target.id, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { title: true },
    }),
    prisma.task.findMany({
      where: { aeProfile: { userId: target.id }, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { title: true },
    }),
  ]);

  const existingOpenTasks = [...openAssignedTasks, ...openAeTasks];

  // Build the AI input — works for both AEs and directors
  let strengths: string[] = [];
  let weaknesses: string[] = [];
  let scores: Array<{ category: string; score: number }> = [];

  if (aeProfile) {
    strengths = (aeProfile.strengthsJson as string[]) ?? [];
    weaknesses = (aeProfile.weaknessesJson as string[]) ?? [];
    scores = aeProfile.skillScores.map((s) => ({ category: s.category, score: s.score }));
  } else if (directorProfile) {
    strengths = (directorProfile.strengthsJson as string[]) ?? [];
    weaknesses = (directorProfile.weaknessesJson as string[]) ?? [];
    scores = directorProfile.skillScores.map((s) => ({ category: s.category, score: s.score }));
  }

  const draft = await generateTasksForAe({
    aeName: target.name,
    strengths,
    weaknesses,
    skillScores: scores,
    existingOpenTasks,
    count: parsed.data.count,
    // v3.36 — pass the target's role so the prompt can reframe IC tasks
    // ("build top of funnel") into leadership tasks ("coach reps on top of
    // funnel") for directors / VPs / admins.
    role: target.role as "AE" | "DIRECTOR" | "VP_SALES" | "COMPANY_ADMIN" | "ORG_ADMIN",
  });

  return NextResponse.json({
    target: { id: target.id, name: target.name, role: target.role },
    draft,
    hasProfile: !!(aeProfile || directorProfile),
  });
}
